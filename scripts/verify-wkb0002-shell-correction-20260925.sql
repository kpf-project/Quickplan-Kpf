\pset pager off
begin read only;

do $$
declare
  v_receipt_ids uuid[] := array[
    '58b7ca69-8fcc-407a-aa8b-1f0722e9b233'::uuid,
    '3a7328f4-933e-4864-a333-5c7bcd9a280d'::uuid,
    '35886d83-27a1-4387-95fa-4c8932552be7'::uuid,
    '17bfddd0-bc3c-4124-a0c3-81d16ea3d605'::uuid,
    '576dfc18-e8aa-4b45-9729-769653cf37c4'::uuid
  ];
begin
  if (
    select count(*) <> 5 or round(sum(r.net_weight_kg)::numeric, 3) <> 63.850
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id = r.product_config_id
    join public.production_weight_scale_lots l on l.id = r.lot_id
    where r.id = any(v_receipt_ids)
      and p.sku_code = 'WKB-0002'
      and l.lot_code = '2509260002-1'
      and r.metadata ->> 'productCode' = 'WKB-0002'
  ) then
    raise exception 'Receipt verification failed';
  end if;

  if (
    select count(*) <> 5 or round(sum(i.weight_kg)::numeric, 3) <> 63.850
    from public.production_stock_issue_items i
    join public.production_stock_issue_documents d on d.id = i.issue_document_id
    where i.source_receipt_id = any(v_receipt_ids)
      and i.product_code = 'WKB-0002'
      and i.product_name_snapshot = 'แผ่นแครกเกอร์โบตั๋น'
      and i.lot_no = '2509260002-1'
      and i.status = 'confirmed'
      and d.status = 'confirmed'
      and d.issue_date = date '2026-09-28'
  ) then
    raise exception 'Issue verification failed';
  end if;

  if (
    select count(*) <> 10
      or round(sum(m.weight_in_kg)::numeric, 3) <> 63.850
      or round(sum(m.weight_out_kg)::numeric, 3) <> 63.850
    from public.production_stock_movements m
    where m.metadata ->> 'sourceReceiptId' = any(v_receipt_ids::text[])
      and m.product_code = 'WKB-0002'
      and m.product_name_snapshot = 'แผ่นแครกเกอร์โบตั๋น'
      and m.lot_no = '2509260002-1'
  ) then
    raise exception 'Movement verification failed';
  end if;

  if exists (
    select 1
    from public.production_stock_issue_items i
    where i.source_receipt_id = any(v_receipt_ids)
      and i.product_code = 'WKB-0002-2'
  ) or exists (
    select 1
    from public.production_stock_movements m
    where m.metadata ->> 'sourceReceiptId' = any(v_receipt_ids::text[])
      and m.product_code = 'WKB-0002-2'
  ) then
    raise exception 'Old product code remains in corrected chain';
  end if;
end;
$$;

select p.sku_code,
       pc.sku_name,
       l.lot_code,
       count(*) as receipt_count,
       round(sum(r.net_weight_kg)::numeric, 3) as receipt_weight_kg
from public.production_weight_receipts r
join public.production_weight_scale_products p on p.id = r.product_config_id
join public.production_weight_scale_lots l on l.id = r.lot_id
join public.products_cache pc on pc.sku_code = p.sku_code
where p.sku_code = 'WKB-0002'
  and l.lot_code = '2509260002-1'
  and r.status = 'recorded'
group by p.sku_code, pc.sku_name, l.lot_code;

commit;
