\pset pager off
begin read only;

with opening as (
 select coalesce(sum(quantity),0) qty,coalesce(sum(weight_kg),0) kg
 from public.production_stock_opening_balances
 where product_code='WKB-0053' and lot_no='2408260053-1' and balance_date<'2026-09-01'
), receipts as (
 select count(*) qty,coalesce(sum(r.net_weight_kg),0) kg
 from public.production_weight_receipts r
 join public.production_weight_scale_lots l on l.id=r.lot_id
 where l.lot_code='2408260053-1' and r.status='recorded'
   and coalesce(r.metadata->>'isReturn','false')<>'true'
   and timezone('Asia/Bangkok',r.weighed_at)::date<'2026-09-01'
), issues as (
 select coalesce(sum(i.quantity),0) qty,coalesce(sum(i.weight_kg),0) kg
 from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
   and i.status='confirmed' and d.status='confirmed' and d.issue_date<'2026-09-01'
), returns as (
 select coalesce(sum(m.quantity_in),0) qty,coalesce(sum(m.weight_in_kg),0) kg
 from public.production_stock_movements m
 join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
 join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
   and m.movement_type='return_in' and m.movement_date<'2026-09-01'
   and i.status='confirmed' and d.status='confirmed'
)
select 'opening_seed' part,* from opening union all
select 'receipts',* from receipts union all select 'issues',* from issues union all select 'returns',* from returns;

select d.issue_date,i.barcode,i.weight_kg,i.status,d.status,
       i.metadata->>'isReturnReceipt' is_return_receipt
from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1' and d.issue_date='2026-09-01'
  and (i.barcode in ('24082600530147','24082600530148','24082600530147X01','24082600530148X01')
       or i.weight_kg=15.370)
order by i.created_at;

commit;
