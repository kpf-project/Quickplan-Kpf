\pset pager off
begin read only;

select i.source_receipt_id,i.barcode,i.weight_kg,
       string_agg(d.issue_date::text||':'||i.status||':'||d.status,', ' order by d.issue_date,i.created_at) history,
       count(*) issue_rows
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
group by i.source_receipt_id,i.barcode,i.weight_kg
having count(*)>1
order by i.barcode;

select d.issue_date,d.issue_no,i.barcode,i.weight_kg,i.status,d.status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) voided_at,
       timezone('Asia/Bangkok',i.restored_at) restored_at,
       i.void_reason,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (i.status='voided' or i.voided_at is not null or i.restored_at is not null
       or i.weight_kg in (15.370,15.630,18.210,18.710,19.270))
order by d.issue_date,i.created_at;

select m.movement_date,m.movement_type,m.weight_in_kg,m.weight_out_kg,
       m.metadata->>'barcode' barcode,m.source_document_type,m.source_document_no,
       timezone('Asia/Bangkok',m.created_at) created_at
from public.production_stock_movements m
where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
  and (m.weight_in_kg in (15.370,15.630,18.210,18.710,19.270)
       or m.weight_out_kg in (15.370,15.630,18.210,18.710,19.270)
       or m.source_document_type='stock_issue_void')
order by m.movement_date,m.created_at;

select r.barcode,r.net_weight_kg,r.status,
       timezone('Asia/Bangkok',r.weighed_at) weighed_at,
       r.metadata->>'isReturn' is_return,
       r.metadata->>'sourceBarcode' source_barcode,
       r.metadata->>'sourceIssueItemId' source_issue_item_id
from public.production_weight_receipts r
join public.production_weight_scale_lots l on l.id=r.lot_id
where l.lot_code='2408260053-1'
  and (r.net_weight_kg in (15.370,15.630,18.210,18.710,19.270)
       or r.metadata->>'sourceBarcode' in ('24082600530147','24082600530148'))
order by r.barcode;

commit;
