begin read only;

do $$
declare
  v_opening numeric;
  v_sep4_issue numeric;
begin
  if (select count(*) from public.production_stock_issue_items
      where id in ('ccd2f129-3c4a-4eab-a6dd-588c86d54863','7ab4b280-d4cc-4bfc-b0fa-0d6dd6f004c6')
        and status='confirmed') <> 2 then
    raise exception 'Source issues are not restored';
  end if;

  if (select count(*) from public.production_stock_issue_items
      where id in ('e9e506b8-f479-4156-b473-376774578ef9','d41795a4-9967-4936-9ee0-767ee04b3996')
        and status='voided') <> 2 then
    raise exception 'Duplicate root issues are not voided';
  end if;

  if not exists (
    select 1 from public.production_stock_issue_items
    where id='60a9f637-964e-4a70-95fa-0680d55c4c03' and status='voided'
  ) or (select count(*) from public.production_stock_issue_items
        where id in ('85ee4c50-7f1b-45b3-9c61-e03a2f065fc6','3e4c5640-b194-4505-990a-b8131d9dc5c9')
          and status='confirmed') <> 2 then
    raise exception 'Return-receipt issue history changed unexpectedly';
  end if;

  with receipt_total as (
    select coalesce(sum(r.net_weight_kg),0) weight
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id=r.product_config_id
    join public.production_weight_scale_lots l on l.id=r.lot_id
    where p.sku_code='WKB-0002' and l.lot_code='1908260002-1'
      and r.status='recorded' and lower(coalesce(r.metadata->>'isReturn','false'))<>'true'
  ), issue_total as (
    select coalesce(sum(i.weight_kg),0) weight
    from public.production_stock_issue_items i
    join public.production_stock_issue_documents d on d.id=i.issue_document_id
    where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
      and d.issue_date<'2026-09-04' and i.status='confirmed' and d.status='confirmed'
  ), return_total as (
    select coalesce(sum(m.weight_in_kg),0) weight
    from public.production_stock_movements m
    left join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
    left join public.production_stock_issue_documents d on d.id=i.issue_document_id
    where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
      and m.movement_date<'2026-09-04' and m.movement_type='return_in'
      and (nullif(m.metadata->>'sourceIssueItemId','') is null or (i.status='confirmed' and d.status='confirmed'))
  ), waste_total as (
    select coalesce(sum(m.weight_out_kg),0) weight
    from public.production_stock_movements m
    left join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
    left join public.production_stock_issue_documents d on d.id=i.issue_document_id
    where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
      and m.movement_date<'2026-09-04' and m.movement_type='waste_out'
      and (nullif(m.metadata->>'sourceIssueItemId','') is null or (i.status='confirmed' and d.status='confirmed'))
  )
  select round(r.weight-i.weight+t.weight-w.weight,3)
  into v_opening
  from receipt_total r cross join issue_total i cross join return_total t cross join waste_total w;

  select round(coalesce(sum(i.weight_kg),0),3)
  into v_sep4_issue
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
    and d.issue_date='2026-09-04' and i.status='confirmed' and d.status='confirmed';

  if v_opening <> 47.450 or v_sep4_issue <> 47.450 then
    raise exception 'Report verification failed: opening %, issue %',v_opening,v_sep4_issue;
  end if;
end $$;

select 'WKB-0002' product_code,'1908260002-1' lot_no,47.450::numeric opening_weight_kg,47.450::numeric issue_weight_kg;
commit;
