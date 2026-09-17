begin read only;

-- Source issues that were returned and later cancelled.
select i.id,i.barcode,i.weight_kg,i.status,i.voided_at,i.void_reason,
       d.issue_no,d.issue_date,d.status document_status,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
order by i.barcode;

-- Child return receipts created from those source issues.
select r.id,r.barcode,r.net_weight_kg,r.status,r.weighed_at,
       r.metadata->>'sourceIssueItemId' source_issue_item_id,
       r.metadata->>'sourceBarcode' source_barcode
from public.production_weight_receipts r
where r.metadata->>'sourceIssueItemId' in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
order by r.barcode;

-- Every confirmed re-issue of either the original receipts or return receipts.
with receipt_ids as (
  select source_receipt_id id from public.production_stock_issue_items
  where id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
  union
  select id from public.production_weight_receipts
  where metadata->>'sourceIssueItemId' in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
)
select i.id,i.barcode,i.weight_kg,i.status,d.issue_date,d.status document_status,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.source_receipt_id in (select id from receipt_ids)
order by d.issue_date,i.barcode,i.created_at;

-- Cancellation adjustments for the two source items.
select id,movement_no,movement_type,movement_date,quantity_in,weight_in_kg,
       reference_no,metadata->>'issueItemId' issue_item_id
from public.production_stock_movements
where reference_no in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
   or metadata->>'issueItemId' in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4')
order by movement_at,movement_type;

commit;
