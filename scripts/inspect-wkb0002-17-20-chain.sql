\pset pager off
begin read only;

select d.issue_date,d.issue_no,i.id,i.barcode,i.weight_kg,i.status,d.status,
       i.created_at,i.voided_at,i.restored_at,i.void_reason,
       i.metadata->>'isReturnReceipt' is_return_receipt,
       i.metadata->>'rootSourceReceiptId' root_receipt_id,
       i.metadata #>> '{historicalReturnChainRepair20260907,action}' repair_action
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
  and (i.metadata->>'rootSourceReceiptId' in
    ('d44a97b0-2424-4952-ac7d-09157f17404b','35576b4f-c78d-4f70-8d30-02aeea4c30d4')
    or i.barcode in ('19082600020017','19082600020020','19082600020017X01','19082600020020X01'))
order by d.issue_date,i.created_at;

select m.movement_date,m.movement_type,m.quantity_in,m.weight_in_kg,
       m.quantity_out,m.weight_out_kg,m.source_document_type,m.source_document_no,
       m.metadata->>'barcode' barcode,m.metadata->>'returnBarcode' return_barcode,
       m.metadata->>'sourceIssueItemId' source_issue_item_id
from public.production_stock_movements m
where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
  and (m.metadata->>'barcode' like '19082600020017%'
    or m.metadata->>'barcode' like '19082600020020%'
    or m.metadata->>'returnBarcode' in ('19082600020017X01','19082600020020X01')
    or m.metadata->>'sourceBarcode' in ('19082600020017','19082600020020'))
order by m.movement_date,m.created_at;

commit;
