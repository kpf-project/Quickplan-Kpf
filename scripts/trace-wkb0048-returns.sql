begin read only;

select m.movement_date,m.movement_at,m.movement_no,m.weight_in_kg,
       m.metadata->>'sourceBarcode' source_barcode,
       m.metadata->>'returnBarcode' return_barcode,
       m.metadata->>'sourceIssueItemId' source_issue_item_id,
       i.status source_status,d.issue_date source_issue_date,d.status source_document_status
from public.production_stock_movements m
left join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
left join public.production_stock_issue_documents d on d.id=i.issue_document_id
where m.product_code='WKB-0048' and m.lot_no='2708260048-1' and m.movement_type='return_in'
order by m.movement_date,m.movement_at;

select (r.weighed_at at time zone 'Asia/Bangkok') return_time,r.barcode,r.net_weight_kg,r.status,
       r.metadata->>'productionDate' production_date,
       r.metadata->>'sourceBarcode' source_barcode,
       r.metadata->>'sourceIssueItemId' source_issue_item_id
from public.production_weight_receipts r
where r.metadata->>'isReturn'='true'
  and r.lot_id in (select distinct lot_id from public.production_weight_receipts where barcode like '2708260048%')
order by r.weighed_at,r.barcode;

with items as (
 select i.id,i.barcode,i.weight_kg
 from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where i.product_code='WKB-0048' and i.lot_no='2708260048-1' and d.issue_date='2026-09-03' and i.status='confirmed' and d.status='confirmed'
)
select a.barcode,a.weight_kg,b.barcode,b.weight_kg
from items a join items b on b.id>a.id
where round(a.weight_kg+b.weight_kg,2)=23.34;

commit;
