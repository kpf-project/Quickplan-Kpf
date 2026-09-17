begin read only;
select count(*) issue_rows,
       sum(i.quantity) issue_quantity,
       sum(i.weight_kg) issued_net_kg,
       sum(r.gross_weight_kg) receipt_gross_kg,
       sum(r.tare_weight_kg) receipt_tare_kg,
       sum(r.net_weight_kg) receipt_net_kg,
       sum(r.amount_per_pallet) amount_per_pallet
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
join public.production_weight_receipts r on r.id=i.source_receipt_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and d.issue_date='2026-09-03' and d.status='confirmed' and i.status='confirmed';

select r.barcode,r.gross_weight_kg,r.tare_weight_kg,r.net_weight_kg,r.amount_per_pallet,r.status,
       d.issue_date,i.status item_status
from public.production_weight_receipts r
left join public.production_stock_issue_items i on i.source_receipt_id=r.id and i.status='confirmed'
left join public.production_stock_issue_documents d on d.id=i.issue_document_id
where r.barcode in ('24082600530038','24082600530039','24082600530040')
order by r.barcode;
commit;
