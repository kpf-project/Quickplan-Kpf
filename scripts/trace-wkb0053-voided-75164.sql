\pset pager off
begin read only;

select d.issue_date,d.issue_no,i.barcode,i.weight_kg,
       i.status item_status,d.status document_status,
       i.voided_at,i.restored_at,i.void_reason,
       coalesce(i.metadata->'historicalCorrection20260907'->>'action','') correction_action
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
  and (i.status='voided' or d.status='voided' or i.voided_at is not null or i.restored_at is not null)
order by d.issue_date,i.created_at;

select d.issue_date,
       count(*) filter(where i.status='confirmed' and d.status='confirmed') confirmed_qty,
       round(coalesce(sum(i.weight_kg) filter(where i.status='confirmed' and d.status='confirmed'),0)::numeric,2) confirmed_kg,
       count(*) filter(where i.status='voided' or d.status='voided') voided_qty,
       round(coalesce(sum(i.weight_kg) filter(where i.status='voided' or d.status='voided'),0)::numeric,2) voided_kg,
       round(coalesce(sum(i.weight_kg),0)::numeric,2) all_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
group by d.issue_date
order by d.issue_date;

select m.movement_date,m.movement_type,m.quantity_in,m.weight_in_kg,
       m.quantity_out,m.weight_out_kg,m.source_document_type,
       m.source_document_no,m.metadata->>'barcode' barcode,
       m.metadata->>'issueItemId' issue_item_id
from public.production_stock_movements m
where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
  and (m.movement_type='adjustment_in' or m.source_document_type='stock_issue_void')
order by m.movement_date,m.created_at;

commit;
