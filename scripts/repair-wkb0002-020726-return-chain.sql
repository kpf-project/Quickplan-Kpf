-- Repair the exact WKB-0002 / 0207260002-1 chain that hides a valid 3.190 kg return.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_item as select * from public.production_stock_issue_items
where id='31d7d840-10ad-4e67-9ac7-b7f1d8e74167';
create temp table duplicate_item as select * from public.production_stock_issue_items
where id='3b49aa06-6a17-4f4a-86fd-b3e5e7e10436';
create temp table affected_documents as select * from public.production_stock_issue_documents
where id in ('b187d3ca-12f9-4ea6-b349-9af30e2154e2','4494b4c7-6b34-4ecb-abdf-40e301961534');
create temp table second_return_receipt as select * from public.production_weight_receipts
where id='b4faa2be-05dd-4b93-a602-ce57a9e5cd34';
create temp table second_return_movement as select * from public.production_stock_movements
where id='8f71fa45-9657-4894-875f-43aa00919ea5';
create temp table source_adjustment as select * from public.production_stock_movements
where movement_type='adjustment_in'
  and metadata->>'issueItemId'='31d7d840-10ad-4e67-9ac7-b7f1d8e74167'
  and metadata->>'reversedMovementType'='issue_out';

select id from public.production_stock_issue_items where id in
  ('31d7d840-10ad-4e67-9ac7-b7f1d8e74167','3b49aa06-6a17-4f4a-86fd-b3e5e7e10436') for update;
select id from public.production_stock_issue_documents where id in (select id from affected_documents) for update;
select id from public.production_weight_receipts where id in (select id from second_return_receipt) for update;
select id from public.production_stock_movements where id in (
  select id from second_return_movement union select id from source_adjustment) for update;

do $$ begin
  if (select count(*) from source_item)<>1 or (select count(*) from duplicate_item)<>1
     or (select count(*) from affected_documents)<>2
     or (select count(*) from second_return_receipt)<>1
     or (select count(*) from second_return_movement)<>1
     or (select count(*) from source_adjustment)<>1 then
    raise exception 'Expected exact WKB-0002 chain row counts';
  end if;
  if exists(select 1 from source_item where status<>'voided' or barcode<>'02072600020350'
      or product_code<>'WKB-0002' or lot_no<>'0207260002-1' or weight_kg<>13.800)
     or exists(select 1 from duplicate_item where status<>'confirmed' or barcode<>'02072600020350'
      or source_receipt_id<>(select source_receipt_id from source_item) or weight_kg<>13.800) then
    raise exception 'Source/duplicate issue precondition failed';
  end if;
  if not exists(select 1 from affected_documents where id='b187d3ca-12f9-4ea6-b349-9af30e2154e2' and status='voided')
     or not exists(select 1 from affected_documents where id='4494b4c7-6b34-4ecb-abdf-40e301961534' and status='confirmed')
     or exists(select 1 from affected_documents d where
       (select count(*) from public.production_stock_issue_items i where i.issue_document_id=d.id)<>1) then
    raise exception 'Document precondition failed';
  end if;
  if not exists(select 1 from public.production_stock_movements
       where movement_type='return_in' and weight_in_kg=3.190
         and metadata->>'sourceIssueItemId'='31d7d840-10ad-4e67-9ac7-b7f1d8e74167')
     or not exists(select 1 from second_return_movement
       where movement_type='return_in' and weight_in_kg=4.860
         and metadata->>'sourceIssueItemId'='3b49aa06-6a17-4f4a-86fd-b3e5e7e10436')
     or not exists(select 1 from second_return_receipt
       where status='recorded' and net_weight_kg=4.860
         and metadata->>'sourceIssueItemId'='3b49aa06-6a17-4f4a-86fd-b3e5e7e10436') then
    raise exception 'Return history precondition failed';
  end if;
  if not exists(select 1 from public.production_stock_issue_items i
       join public.production_stock_issue_documents d on d.id=i.issue_document_id
       where i.source_receipt_id='569941c4-9eb6-4114-ad63-276cd42f5311'
         and i.weight_kg=3.190 and i.status='confirmed' and d.status='confirmed')
     or not exists(select 1 from public.production_stock_issue_items i
       join public.production_stock_issue_documents d on d.id=i.issue_document_id
       where i.source_receipt_id='b4faa2be-05dd-4b93-a602-ce57a9e5cd34'
         and i.weight_kg=4.860 and i.status='confirmed' and d.status='confirmed') then
    raise exception 'Return receipt issue precondition failed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItem',(select to_jsonb(x) from source_item x),'duplicateItem',(select to_jsonb(x) from duplicate_item x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x),'secondReturnReceipt',(select to_jsonb(x) from second_return_receipt x),'secondReturnMovement',(select to_jsonb(x) from second_return_movement x),'sourceAdjustment',(select to_jsonb(x) from source_adjustment x))) to '.backups/wkb0002-020726-return-chain-before.json'
\endif

update public.production_weight_receipts
set metadata=metadata||jsonb_build_object(
  'sourceIssueItemId','31d7d840-10ad-4e67-9ac7-b7f1d8e74167',
  'sourceIssueDocumentId','b187d3ca-12f9-4ea6-b349-9af30e2154e2',
  'returnedWeightBeforeKg',3.190,
  'returnedWeightAfterKg',8.050,
  'remainingWeightKg',5.750,
  'historicalReturnChainRepair20260908',jsonb_build_object('action','reattach_to_active_source_issue'))
where id in (select id from second_return_receipt);

update public.production_stock_movements
set metadata=metadata||jsonb_build_object(
  'sourceIssueItemId','31d7d840-10ad-4e67-9ac7-b7f1d8e74167',
  'sourceIssueDocumentId','b187d3ca-12f9-4ea6-b349-9af30e2154e2',
  'returnedWeightBeforeKg',3.190,
  'returnedWeightAfterKg',8.050,
  'remainingWeightKg',5.750,
  'historicalReturnChainRepair20260908',jsonb_build_object('action','reattach_to_active_source_issue'))
where id in (select id from second_return_movement);

update public.production_stock_issue_items
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260908',
    jsonb_build_object('action','restore_source_issue'))
where id in (select id from source_item);
update public.production_stock_issue_documents
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260908',
    jsonb_build_object('action','restore_source_issue'))
where id=(select issue_document_id from source_item);

update public.production_stock_issue_items
set status='voided',voided_at=now(),voided_by=null,
  void_reason='แก้ประวัติซ้ำ: คืนสถานะใบต้นทางเดิมที่มีสายชั่งคืน',
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260908',
    jsonb_build_object('action','void_duplicate_root_issue'))
where id in (select id from duplicate_item);
update public.production_stock_issue_documents
set status='voided',voided_at=now(),voided_by=null,
  void_reason='แก้ประวัติซ้ำ: คืนสถานะใบต้นทางเดิมที่มีสายชั่งคืน',
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260908',
    jsonb_build_object('action','void_duplicate_root_issue'))
where id=(select issue_document_id from duplicate_item);

update public.production_stock_movements m
set metadata=m.metadata||jsonb_build_object('historicalReturnChainRepair20260908',
  jsonb_build_object(
    'effectiveReversalOfIssueItemId','3b49aa06-6a17-4f4a-86fd-b3e5e7e10436',
    'originalCancelledIssueItemId','31d7d840-10ad-4e67-9ac7-b7f1d8e74167'))
where id in (select id from source_adjustment);

do $$ begin
  if not exists(select 1 from public.production_stock_issue_items
      where id='31d7d840-10ad-4e67-9ac7-b7f1d8e74167' and status='confirmed')
     or not exists(select 1 from public.production_stock_issue_items
      where id='3b49aa06-6a17-4f4a-86fd-b3e5e7e10436' and status='voided')
     or not exists(select 1 from public.production_weight_receipts
      where id='b4faa2be-05dd-4b93-a602-ce57a9e5cd34'
        and metadata->>'sourceIssueItemId'='31d7d840-10ad-4e67-9ac7-b7f1d8e74167') then
    raise exception 'Repair verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
