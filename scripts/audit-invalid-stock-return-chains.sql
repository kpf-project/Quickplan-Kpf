begin read only;

with invalid_sources as (
  select
    source_item.id source_issue_item_id,
    source_item.issue_document_id source_document_id,
    source_item.source_receipt_id,
    source_item.product_code,
    source_item.lot_no,
    source_item.barcode,
    source_item.weight_kg,
    source_document.issue_date,
    count(distinct returns.id) return_count,
    round(sum(returns.weight_in_kg),3) return_weight_kg
  from public.production_stock_issue_items source_item
  join public.production_stock_issue_documents source_document on source_document.id=source_item.issue_document_id
  join public.production_stock_movements returns
    on returns.metadata->>'sourceIssueItemId'=source_item.id::text and returns.movement_type='return_in'
  where source_item.status='voided' or source_document.status='voided'
  group by source_item.id,source_document.id
), classified as (
  select s.*,
    (select count(*) from public.production_stock_issue_items duplicate_item
     join public.production_stock_issue_documents duplicate_document on duplicate_document.id=duplicate_item.issue_document_id
     where duplicate_item.id<>s.source_issue_item_id
       and duplicate_item.source_receipt_id=s.source_receipt_id
       and duplicate_item.barcode=s.barcode and duplicate_item.weight_kg=s.weight_kg
       and duplicate_item.status='confirmed' and duplicate_document.status='confirmed') active_duplicate_count,
    (select count(*) from public.production_stock_movements adjustment
     where adjustment.movement_type='adjustment_in'
       and adjustment.metadata->>'issueItemId'=s.source_issue_item_id::text
       and adjustment.metadata->>'reversedMovementType'='issue_out') cancellation_adjustment_count,
    (select count(*) from public.production_stock_movements child
     join public.production_stock_issue_items duplicate_item
       on duplicate_item.source_receipt_id=s.source_receipt_id and duplicate_item.id<>s.source_issue_item_id
     join public.production_stock_issue_documents duplicate_document on duplicate_document.id=duplicate_item.issue_document_id
     where duplicate_item.barcode=s.barcode and duplicate_item.weight_kg=s.weight_kg
       and duplicate_item.status='confirmed' and duplicate_document.status='confirmed'
       and child.metadata->>'sourceIssueItemId'=duplicate_item.id::text
       and child.movement_type in ('return_in','waste_out')) duplicate_child_count
  from invalid_sources s
)
select source_issue_item_id,source_document_id,source_receipt_id,product_code,lot_no,barcode,
       weight_kg,issue_date,return_count,return_weight_kg,active_duplicate_count,
       cancellation_adjustment_count,duplicate_child_count,
       (active_duplicate_count=1 and cancellation_adjustment_count=1 and duplicate_child_count=0) safely_repairable
from classified
order by safely_repairable desc,product_code,lot_no,barcode;

commit;
