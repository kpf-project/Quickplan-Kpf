begin read only;

select column_name from information_schema.columns
where table_schema='public' and table_name='production_weight_receipts'
order by ordinal_position;

select d.issue_date,(i.issued_at at time zone 'Asia/Bangkok')::date scan_date,
       d.status document_status,i.status item_status,
       count(*) qty,sum(i.weight_kg) kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (d.issue_date between '2026-09-02' and '2026-09-04'
       or (i.issued_at at time zone 'Asia/Bangkok')::date between '2026-09-02' and '2026-09-04')
group by 1,2,3,4 order by 1,2,3,4;

select d.issue_no,d.issue_date,i.barcode,i.weight_kg,i.status item_status,d.status document_status,
       i.issued_at,i.voided_at,i.void_reason,i.source_receipt_id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (d.issue_date='2026-09-03' or (i.issued_at at time zone 'Asia/Bangkok')::date='2026-09-03')
order by i.issued_at,i.barcode;

select movement_date,movement_type,count(*) qty_rows,
       sum(quantity_in) quantity_in,sum(weight_in_kg) weight_in,
       sum(quantity_out) quantity_out,sum(weight_out_kg) weight_out
from public.production_stock_movements
where product_code='WKB-0053' and lot_no='2408260053-1'
  and movement_date between '2026-09-02' and '2026-09-04'
group by 1,2 order by 1,2;

commit;
