begin read only;
select 'receipt' source,r.barcode reference,r.net_weight_kg weight_value,(r.weighed_at at time zone 'Asia/Bangkok')::date event_date
from public.production_weight_receipts r
join public.production_weight_scale_products p on p.id=r.product_config_id
where p.sku_code='WKB-0048' and r.net_weight_kg in (14.69,23.34)
union all
select 'issue',i.barcode,i.weight_kg,d.issue_date
from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.weight_kg in (14.69,23.34)
union all
select 'movement',m.movement_no,coalesce(nullif(m.weight_in_kg,0),m.weight_out_kg),m.movement_date
from public.production_stock_movements m
where m.product_code='WKB-0048' and (m.weight_in_kg in (14.69,23.34) or m.weight_out_kg in (14.69,23.34))
order by event_date,source,reference;
commit;
