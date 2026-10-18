begin;

create temporary table cancellation_candidate on commit drop as
select r.id, r.barcode
from public.production_weight_receipts r
join public.production_weight_scale_products sp on sp.id = r.product_config_id
join public.production_departments d on d.id = sp.department_id
join public.products_cache p on p.sku_code = sp.sku_code
where r.status = 'recorded'
  and lower(coalesce(r.metadata ->> 'isReturn', 'false')) <> 'true'
  and d.code = 'KP13'
  and p.iccat_code = '03'
  and not exists (
    select 1
    from public.production_stock_issue_items i
    join public.production_stock_issue_documents doc on doc.id = i.issue_document_id
    where i.source_receipt_id = r.id
      and i.status = 'confirmed'
      and doc.status = 'confirmed'
  )
order by r.weighed_at desc
limit 1;

do $$
declare
  v_id uuid;
  v_barcode text;
  v_second_result jsonb;
  v_reversal_count integer;
begin
  select id, barcode into v_id, v_barcode from cancellation_candidate;
  if v_id is null then
    raise exception 'No safe receipt is available for rollback cancellation test';
  end if;

  perform public.cancel_production_weight_receipt(v_id, null, 'rollback test');

  if not exists (
    select 1 from public.production_weight_receipts
    where id = v_id and status = 'voided'
  ) then
    raise exception 'Receipt was not voided';
  end if;

  if not exists (
    select 1 from public.production_stock_movements
    where movement_type = 'adjustment_out'
      and source_document_type = 'weight_receipt_void'
      and source_document_no = v_barcode
  ) then
    raise exception 'Receipt cancellation did not create its reversal movement';
  end if;

  v_second_result := public.cancel_production_weight_receipt(v_id, null, 'rollback retry test');
  if coalesce((v_second_result ->> 'alreadyCancelled')::boolean, false) is not true then
    raise exception 'Repeated cancellation was not reported as idempotent success';
  end if;

  select count(*) into v_reversal_count
  from public.production_stock_movements
  where movement_type = 'adjustment_out'
    and source_document_type = 'weight_receipt_void'
    and source_document_no = v_barcode;

  if v_reversal_count <> 1 then
    raise exception 'Repeated cancellation created % reversal movements instead of one', v_reversal_count;
  end if;
end;
$$;

select 'PASS: atomic cancellation and reversal verified; rolling back' as result;
rollback;
