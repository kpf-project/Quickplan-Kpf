\pset pager off
begin read only;

select d.issue_date,d.issue_no,i.barcode,i.weight_kg,i.status,d.status,
       i.metadata->>'isReturnReceipt' is_return_receipt,
       i.metadata->>'rootSourceReceiptId' root_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
  and d.issue_date between '2026-09-01' and '2026-09-04'
order by d.issue_date,i.created_at;

select m.movement_date,m.movement_type,m.quantity_in,m.weight_in_kg,
       m.quantity_out,m.weight_out_kg,m.metadata->>'barcode' barcode,
       m.metadata->>'returnBarcode' return_barcode,m.source_document_no
from public.production_stock_movements m
where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
  and m.movement_date between '2026-09-01' and '2026-09-04'
order by m.movement_date,m.created_at;

commit;
