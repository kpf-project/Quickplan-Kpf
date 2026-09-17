\pset pager off
begin read only;

select i.barcode,d.issue_date selected_issue_date,
       timezone('Asia/Bangkok',i.created_at) clicked_at_bangkok,
       d.issue_no,i.status,d.status,
       timezone('Asia/Bangkok',i.voided_at) voided_at_bangkok,
       timezone('Asia/Bangkok',i.restored_at) restored_at_bangkok,
       i.void_reason,i.metadata #>> '{historicalReturnChainRepair20260907,action}' repair_action
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
  and i.barcode in ('19082600020017','19082600020020')
order by i.barcode,d.issue_date,i.created_at;

select m.metadata->>'barcode' barcode,m.movement_date cancellation_business_date,
       timezone('Asia/Bangkok',m.created_at) cancelled_at_bangkok,
       m.source_document_no,m.remark
from public.production_stock_movements m
where m.source_document_type='stock_issue_void'
  and m.metadata->>'barcode' in ('19082600020017','19082600020020')
order by barcode,m.created_at;

commit;
