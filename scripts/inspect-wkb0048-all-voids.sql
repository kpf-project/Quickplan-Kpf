begin read only;
select (i.voided_at at time zone 'Asia/Bangkok')::date void_date,d.issue_date,i.barcode,i.lot_no,i.weight_kg,i.void_reason
from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.status='voided'
order by i.voided_at,i.barcode;
commit;
