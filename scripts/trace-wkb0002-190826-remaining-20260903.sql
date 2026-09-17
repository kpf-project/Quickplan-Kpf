\pset pager off
begin read only;

with lot_receipts as (
  select r.id,r.barcode,r.net_weight_kg,r.status,
         coalesce((r.metadata->>'isReturn')::boolean,false) is_return,
         r.metadata->>'sourceIssueItemId' source_issue_item_id
  from public.production_weight_receipts r
  join public.production_weight_scale_lots l on l.id=r.lot_id
  where l.lot_code='1908260002-1'
), active_before_sep4 as (
  select i.source_receipt_id,i.barcode,i.weight_kg,d.issue_date
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
    and i.status='confirmed' and d.status='confirmed' and d.issue_date<'2026-09-04'
), candidates as (
  select r.*
  from lot_receipts r
  left join active_before_sep4 i on i.source_receipt_id=r.id
  left join public.production_stock_issue_items source on source.id::text=nullif(r.source_issue_item_id,'')
  left join public.production_stock_issue_documents source_doc on source_doc.id=source.issue_document_id
  where r.status='recorded' and i.source_receipt_id is null
    and (not r.is_return or (source.status='confirmed' and source_doc.status='confirmed'))
)
select barcode,net_weight_kg,is_return from candidates order by barcode;

select i.barcode,i.weight_kg,i.metadata->>'isReturnReceipt' is_return_receipt,
       d.issue_date,d.issue_no,i.status,d.status
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
  and d.issue_date='2026-09-04'
order by i.created_at;

commit;
