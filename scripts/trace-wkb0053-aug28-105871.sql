\pset pager off
begin read only;

select i.barcode,i.weight_kg,d.issue_date,d.issue_no,
       i.status item_status,d.status document_status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) voided_at,
       i.void_reason
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (d.issue_date='2026-08-28' or i.weight_kg=15.370)
order by d.issue_date,i.created_at;

select m.movement_date,m.movement_type,m.quantity_in,m.weight_in_kg,
       m.quantity_out,m.weight_out_kg,m.metadata->>'barcode' barcode,
       m.source_document_type,m.source_document_no,
       timezone('Asia/Bangkok',m.created_at) created_at
from public.production_stock_movements m
where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
  and (m.movement_date='2026-08-28'
       or m.weight_in_kg=15.370 or m.weight_out_kg=15.370)
order by m.movement_date,m.created_at;

commit;
