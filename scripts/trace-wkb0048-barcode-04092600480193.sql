\pset pager off
begin read only;

select r.id,r.barcode,l.lot_code,r.net_weight_kg,r.status,
       timezone('Asia/Bangkok',r.weighed_at) weighed_at,r.metadata
from public.production_weight_receipts r
left join public.production_weight_scale_lots l on l.id=r.lot_id
where r.barcode='04092600480193';

select i.id,i.barcode,i.product_code,i.lot_no,i.quantity,i.weight_kg,
       d.issue_date,d.issue_no,i.status item_status,d.status document_status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) item_voided_at,
       timezone('Asia/Bangkok',d.voided_at) document_voided_at,
       i.void_reason
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.barcode='04092600480193'
order by d.issue_date,i.created_at;

select movement_date,movement_type,quantity_in,weight_in_kg,quantity_out,weight_out_kg,
       source_document_type,source_document_no,metadata
from public.production_stock_movements
where metadata->>'barcode'='04092600480193'
   or source_document_no='04092600480193'
order by movement_date,created_at;

commit;
