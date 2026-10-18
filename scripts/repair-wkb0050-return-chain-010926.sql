-- Repair the one audited WKB-0050 chain where a valid return still points to
-- a cancelled duplicate issue instead of the active issue for the same receipt.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table source_items as
select * from public.production_stock_issue_items
where id = '18fc7803-b62c-4bf5-b5b2-e62587e664be';

create temp table duplicate_items as
select duplicate.*
from public.production_stock_issue_items duplicate
join source_items source using (source_receipt_id)
join public.production_stock_issue_documents document on document.id = duplicate.issue_document_id
where duplicate.id <> source.id
  and duplicate.barcode = source.barcode
  and duplicate.weight_kg = source.weight_kg
  and duplicate.status = 'confirmed'
  and document.status = 'confirmed';

create temp table affected_documents as
select * from public.production_stock_issue_documents
where id in (
  select issue_document_id from source_items
  union
  select issue_document_id from duplicate_items
);

create temp table source_adjustments as
select * from public.production_stock_movements
where movement_type = 'adjustment_in'
  and metadata ->> 'issueItemId' in (select id::text from source_items);

select id from public.production_stock_issue_items
where id in (select id from source_items union select id from duplicate_items)
for update;
select id from public.production_stock_issue_documents
where id in (select id from affected_documents)
for update;
select id from public.production_stock_movements
where id in (select id from source_adjustments)
for update;

do $$
begin
  if (select count(*) from source_items) <> 1
     or (select count(*) from duplicate_items) <> 1
     or (select count(*) from affected_documents) <> 2
     or (select count(*) from source_adjustments) <> 1 then
    raise exception 'Expected one exact WKB-0050 return chain';
  end if;

  if exists (
    select 1 from source_items
    where status <> 'voided'
       or product_code <> 'WKB-0050'
       or lot_no <> '0109260050-1'
       or barcode <> '01092600500161'
       or weight_kg <> 12.740
  ) then
    raise exception 'Source issue precondition failed';
  end if;

  if exists (
    select 1 from affected_documents document
    where (select count(*) from public.production_stock_issue_items item
           where item.issue_document_id = document.id) <> 1
  ) then
    raise exception 'Affected document has unexpected extra items';
  end if;

  if (select count(*) from public.production_stock_movements movement
      where movement.movement_type = 'return_in'
        and movement.metadata ->> 'sourceIssueItemId' in (select id::text from source_items)
        and movement.weight_in_kg = 4.200) <> 1
     or exists (
       select 1 from public.production_stock_movements movement
       where movement.movement_type in ('return_in', 'waste_out')
         and movement.metadata ->> 'sourceIssueItemId' in (select id::text from duplicate_items)
     ) then
    raise exception 'Child movement precondition failed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(row)) from source_items row),'duplicateItems',(select jsonb_agg(to_jsonb(row)) from duplicate_items row),'documents',(select jsonb_agg(to_jsonb(row)) from affected_documents row),'adjustments',(select jsonb_agg(to_jsonb(row)) from source_adjustments row))) to '.backups/wkb0050-return-chain-010926-before.json'
\endif

update public.production_stock_issue_items
set status = 'confirmed',
    voided_at = null,
    voided_by = null,
    void_reason = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'historicalReturnChainRepair20261008',
      jsonb_build_object('action', 'restore_source_issue')
    )
where id in (select id from source_items);

update public.production_stock_issue_documents
set status = 'confirmed',
    voided_at = null,
    voided_by = null,
    void_reason = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'historicalReturnChainRepair20261008',
      jsonb_build_object('action', 'restore_source_issue')
    )
where id in (select issue_document_id from source_items);

update public.production_stock_issue_items
set status = 'voided',
    voided_at = now(),
    voided_by = null,
    void_reason = 'แก้ประวัติซ้ำ: รายการต้นทางเดิมมีรายการชั่งคืนอยู่แล้ว',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'historicalReturnChainRepair20261008',
      jsonb_build_object('action', 'void_duplicate_root_issue')
    )
where id in (select id from duplicate_items);

update public.production_stock_issue_documents
set status = 'voided',
    voided_at = now(),
    voided_by = null,
    void_reason = 'แก้ประวัติการเบิกต้นทางซ้ำ หลังรายการเดิมมีการชั่งคืน',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'historicalReturnChainRepair20261008',
      jsonb_build_object('action', 'void_duplicate_root_issue')
    )
where id in (select issue_document_id from duplicate_items);

update public.production_stock_movements movement
set metadata = coalesce(movement.metadata, '{}'::jsonb) || jsonb_build_object(
  'historicalReturnChainRepair20261008',
  jsonb_build_object(
    'effectiveReversalOfIssueItemId', (
      select duplicate.id
      from duplicate_items duplicate
      join source_items source using (source_receipt_id)
      where source.id = (movement.metadata ->> 'issueItemId')::uuid
    ),
    'originalCancelledIssueItemId', movement.metadata ->> 'issueItemId'
  )
)
where id in (select id from source_adjustments);

do $$
declare
  v_balance numeric;
begin
  if (select count(*) from public.production_stock_issue_items
      where id in (select id from source_items) and status = 'confirmed') <> 1
     or (select count(*) from public.production_stock_issue_items
         where id in (select id from duplicate_items) and status = 'voided') <> 1 then
    raise exception 'Repair status verification failed';
  end if;

  select round(
    coalesce(sum(receipt.net_weight_kg) filter (
      where receipt.status = 'recorded'
        and lower(coalesce(receipt.metadata ->> 'isReturn', 'false')) not in ('true', '1', 'yes')
    ), 0)
    - coalesce((select sum(item.weight_kg)
      from public.production_stock_issue_items item
      join public.production_stock_issue_documents document on document.id = item.issue_document_id
      where item.product_code = 'WKB-0050' and item.lot_no = '0109260050-1'
        and item.status = 'confirmed' and document.status = 'confirmed'
        and document.issue_date <= '2026-10-05'), 0)
    + coalesce((select sum(movement.weight_in_kg)
      from public.production_stock_movements movement
      join public.production_stock_issue_items item
        on item.id::text = movement.metadata ->> 'sourceIssueItemId'
      join public.production_stock_issue_documents document on document.id = item.issue_document_id
      where movement.product_code = 'WKB-0050' and movement.lot_no = '0109260050-1'
        and movement.movement_type = 'return_in' and movement.movement_date <= '2026-10-05'
        and item.status = 'confirmed' and document.status = 'confirmed'), 0)
  , 3) into v_balance
  from public.production_weight_receipts receipt
  join public.production_weight_scale_products product on product.id = receipt.product_config_id
  join public.production_weight_scale_lots lot on lot.id = receipt.lot_id
  where product.sku_code = 'WKB-0050' and lot.lot_code = '0109260050-1';

  if v_balance <> 15.550 then
    raise exception 'Repair balance verification failed: expected 15.550, got %', v_balance;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
