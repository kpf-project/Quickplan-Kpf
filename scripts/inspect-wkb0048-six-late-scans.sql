begin read only;
with targets as (
 select i.*,d.issue_no,d.issue_date,d.status document_status
 from public.production_stock_issue_items i
 join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where i.product_code='WKB-0048' and d.issue_date='2026-09-03'
   and (i.issued_at at time zone 'Asia/Bangkok')::date='2026-09-04'
)
select t.id,t.issue_no,t.issue_date,t.barcode,t.lot_no,t.weight_kg,t.status,t.document_status,
       t.issued_at,t.voided_at,
       (select count(*) from public.production_weight_receipts r where r.metadata->>'sourceIssueItemId'=t.id::text) return_receipts,
       (select count(*) from public.production_stock_movements m where m.metadata->>'sourceIssueItemId'=t.id::text and m.movement_type in ('return_in','waste_out')) child_movements,
       (select count(*) from public.production_stock_movements m where m.metadata->>'issueItemId'=t.id::text and m.movement_type='adjustment_in') cancellation_movements
from targets t order by t.issued_at,t.barcode;
commit;
