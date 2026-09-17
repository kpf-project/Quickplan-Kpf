begin read only;

select d.issue_date,(i.issued_at at time zone 'Asia/Bangkok')::date scan_date,
       count(*) qty,sum(i.weight_kg) issued_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='2708260048-1'
  and d.issue_date='2026-09-03' and i.status='confirmed' and d.status='confirmed'
group by 1,2 order by 2;

select i.id,d.issue_no,d.issue_date,(i.issued_at at time zone 'Asia/Bangkok') scan_time,
       i.barcode,i.weight_kg,i.status,d.status document_status
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='2708260048-1'
  and d.issue_date='2026-09-03' and i.status='confirmed' and d.status='confirmed'
order by i.weight_kg desc,i.barcode;

select m.id,m.movement_no,m.movement_date,m.movement_type,
       m.quantity_in,m.weight_in_kg,m.quantity_out,m.weight_out_kg,
       m.metadata->>'sourceIssueItemId' source_issue_item_id,
       m.metadata->>'sourceBarcode' source_barcode,
       i.status source_item_status,d.status source_document_status
from public.production_stock_movements m
left join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
left join public.production_stock_issue_documents d on d.id=i.issue_document_id
where m.product_code='WKB-0048' and m.lot_no='2708260048-1'
  and m.movement_date='2026-09-03' and m.movement_type in ('return_in','waste_out')
order by m.movement_type,m.movement_at;

select i.barcode,i.weight_kg,d.issue_date,(i.issued_at at time zone 'Asia/Bangkok') scan_time
from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0048' and i.lot_no='2708260048-1'
  and i.status='confirmed' and d.status='confirmed' and i.weight_kg=14.69
order by d.issue_date,i.issued_at;

commit;
