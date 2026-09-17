begin read only;

do $$
declare
  v_source_item uuid := '31d7d840-10ad-4e67-9ac7-b7f1d8e74167';
  v_source_document uuid := 'b187d3ca-12f9-4ea6-b349-9af30e2154e2';
  v_duplicate_item uuid := '3b49aa06-6a17-4f4a-86fd-b3e5e7e10436';
  v_return_receipt uuid := 'b4faa2be-05dd-4b93-a602-ce57a9e5cd34';
  v_balance numeric;
begin
  if not exists(select 1 from public.production_stock_issue_items where id=v_source_item and status='confirmed')
     or not exists(select 1 from public.production_stock_issue_documents where id=v_source_document and status='confirmed')
     or not exists(select 1 from public.production_stock_issue_items where id=v_duplicate_item and status='voided') then
    raise exception 'WKB-0002 source/duplicate issue chain is not repaired';
  end if;

  if not exists(select 1 from public.production_weight_receipts
    where id=v_return_receipt
      and metadata->>'sourceIssueItemId'=v_source_item::text
      and metadata->>'sourceIssueDocumentId'=v_source_document::text
      and (metadata->>'returnedWeightBeforeKg')::numeric=3.190
      and (metadata->>'returnedWeightAfterKg')::numeric=8.050
      and (metadata->>'remainingWeightKg')::numeric=5.750)
     or not exists(select 1 from public.production_stock_movements
       where metadata->>'returnReceiptId'=v_return_receipt::text
         and movement_type='return_in'
         and metadata->>'sourceIssueItemId'=v_source_item::text
         and metadata->>'sourceIssueDocumentId'=v_source_document::text) then
    raise exception 'WKB-0002 second return is not attached to the active source issue';
  end if;

  select round(
    coalesce((select sum(weight_kg) from public.production_stock_opening_balances
      where product_code='WKB-0002' and lot_no='0207260002-1'),0)
    + coalesce((select sum(r.net_weight_kg)
      from public.production_weight_receipts r
      join public.production_weight_scale_products p on p.id=r.product_config_id
      join public.production_weight_scale_lots l on l.id=r.lot_id
      where p.sku_code='WKB-0002' and l.lot_code='0207260002-1' and r.status='recorded'
        and lower(coalesce(r.metadata->>'isReturn','false')) not in ('true','1','yes')
        and coalesce(nullif(r.metadata->>'productionDate','')::date,
          timezone('Asia/Bangkok',r.weighed_at)::date)<='2026-07-17'),0)
    - coalesce((select sum(i.weight_kg)
      from public.production_stock_issue_items i
      join public.production_stock_issue_documents d on d.id=i.issue_document_id
      where i.product_code='WKB-0002' and i.lot_no='0207260002-1'
        and i.status='confirmed' and d.status='confirmed' and d.issue_date<='2026-07-17'),0)
    + coalesce((select sum(m.weight_in_kg)
      from public.production_stock_movements m
      left join public.production_stock_issue_items i on i.id::text=m.metadata->>'sourceIssueItemId'
      left join public.production_stock_issue_documents d on d.id=i.issue_document_id
      where m.product_code='WKB-0002' and m.lot_no='0207260002-1'
        and m.movement_type='return_in' and m.movement_date<='2026-07-17'
        and (i.id is null or (i.status='confirmed' and d.status='confirmed'))),0)
    - coalesce((select sum(m.weight_out_kg)
      from public.production_stock_movements m
      left join public.production_stock_issue_items i on i.id::text=m.metadata->>'sourceIssueItemId'
      left join public.production_stock_issue_documents d on d.id=i.issue_document_id
      where m.product_code='WKB-0002' and m.lot_no='0207260002-1'
        and m.movement_type='waste_out' and m.movement_date<='2026-07-17'
        and (i.id is null or (i.status='confirmed' and d.status='confirmed'))),0),3)
  into v_balance;

  if v_balance<>0 then
    raise exception 'Expected WKB-0002 LOT balance 0.000 through 2026-07-17, got %',v_balance;
  end if;
end $$;

commit;
