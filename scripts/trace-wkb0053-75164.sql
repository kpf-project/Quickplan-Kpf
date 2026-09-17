\pset pager off
begin read only;

select d.issue_date, i.status item_status, d.status document_status,
       count(*) item_count, round(sum(i.weight_kg)::numeric, 2) weight_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
group by d.issue_date,i.status,d.status
order by d.issue_date,i.status,d.status;

select d.issue_date,i.barcode,i.weight_kg,
       i.status item_status,d.status document_status,
       i.created_at,i.voided_at,i.restored_at,
       coalesce(i.metadata->'historicalCorrection20260907'->>'action','') correction_action,
       i.id item_id,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (d.issue_date between '2026-08-28' and '2026-09-03'
       or i.metadata ? 'historicalCorrection20260907')
order by d.issue_date,i.created_at,i.barcode;

select r.barcode,r.net_weight_kg,r.status,
       timezone('Asia/Bangkok',r.weighed_at)::date weighed_date,
       coalesce(r.metadata->'historicalCorrection20260907'->>'action','') correction_action,
       r.id receipt_id
from public.production_weight_receipts r
join public.production_weight_scale_products p on p.id=r.product_config_id
join public.production_weight_scale_lots l on l.id=r.lot_id
where p.sku_code='WKB-0053' and l.lot_code='2408260053-1'
  and r.barcode in ('24082600530147','24082600530148','24082600530147X01','24082600530148X01')
order by r.barcode;

commit;
