\pset pager off
begin read only;

select d.issue_date,i.status item_status,d.status document_status,
       count(*) quantity,round(sum(i.weight_kg),3) weight_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='0409260048-1'
  and d.issue_date='2026-09-04'
group by 1,2,3 order by 2,3;

select i.barcode,i.weight_kg,i.id,d.issue_no
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='0409260048-1'
  and d.issue_date='2026-09-04' and i.status='confirmed' and d.status='confirmed'
order by i.barcode;

select i.barcode,i.weight_kg,d.issue_no,i.status item_status,d.status document_status,
       timezone('Asia/Bangkok',i.created_at) clicked_at,
       timezone('Asia/Bangkok',i.voided_at) voided_at,i.void_reason
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='0409260048-1'
  and (i.status='voided' or d.status='voided')
order by d.issue_date,i.created_at;

select r.status,count(*) quantity,round(sum(r.net_weight_kg),3) weight_kg
from public.production_weight_receipts r
join public.production_weight_scale_lots l on l.id=r.lot_id
where l.lot_code='0409260048-1'
group by r.status order by r.status;

commit;
