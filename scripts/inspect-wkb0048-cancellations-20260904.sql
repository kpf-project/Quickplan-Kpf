begin read only;

select d.issue_date,(i.issued_at at time zone 'Asia/Bangkok')::date scan_date,
       (i.voided_at at time zone 'Asia/Bangkok')::date void_date,
       d.status document_status,i.status item_status,i.lot_no,
       count(*) qty,sum(i.weight_kg) kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048'
  and (d.issue_date='2026-09-04'
    or (i.issued_at at time zone 'Asia/Bangkok')::date='2026-09-04'
    or (i.voided_at at time zone 'Asia/Bangkok')::date='2026-09-04')
group by 1,2,3,4,5,6 order by 1,2,3,4,5,6;

select i.id issue_item_id,d.issue_no,d.issue_date,i.barcode,i.lot_no,i.weight_kg,
       i.status item_status,d.status document_status,
       i.issued_at,i.voided_at,i.void_reason,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048'
  and (i.voided_at at time zone 'Asia/Bangkok')::date='2026-09-04'
order by i.voided_at,i.barcode;

with cancelled as (
 select i.id,i.source_receipt_id,i.barcode,i.weight_kg
 from public.production_stock_issue_items i
 where i.product_code='WKB-0048' and (i.voided_at at time zone 'Asia/Bangkok')::date='2026-09-04'
)
select c.barcode,c.weight_kg cancelled_weight,
       m.movement_no,m.movement_type,m.movement_date,m.quantity_in,m.weight_in_kg,
       ai.id active_reissue_item_id,ad.issue_date active_reissue_date
from cancelled c
left join public.production_stock_movements m
  on m.metadata->>'issueItemId'=c.id::text and m.movement_type='adjustment_in'
left join public.production_stock_issue_items ai
  on ai.source_receipt_id=c.source_receipt_id and ai.status='confirmed'
left join public.production_stock_issue_documents ad
  on ad.id=ai.issue_document_id and ad.status='confirmed'
order by c.barcode,m.movement_at;

select document_status,item_status,count(*) qty,sum(weight_kg) kg
from public.production_stock_issue_report_lines_v
where product_code='WKB-0048' and issue_date='2026-09-04'
group by 1,2 order by 1,2;

commit;
