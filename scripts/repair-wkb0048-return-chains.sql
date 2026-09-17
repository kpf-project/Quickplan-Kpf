-- Repair only the two WKB-0048 chains proven to contain one cancelled source,
-- one valid return, one duplicate active issue, and one cancellation adjustment.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as select * from public.production_stock_issue_items where id in (
  '8f1f5f0f-c6c6-4e59-a7cf-7f1c0a06390c','e1ac2b3c-92d6-4e49-891c-44c609cbb07b');
create temp table duplicate_items as select * from public.production_stock_issue_items where id in (
  '862173b3-0568-48df-8cca-ba3171002680','6f038536-ca1c-4731-bd74-0c939fe25a08');
create temp table affected_documents as select * from public.production_stock_issue_documents where id in (
  select issue_document_id from source_items union select issue_document_id from duplicate_items);
create temp table source_adjustments as select * from public.production_stock_movements where id in (
  'd88031c7-60a5-45b0-a8d7-c38b90800afb','bb851a5d-5924-4f28-a65a-6935ea0cf583');

select id from public.production_stock_issue_items where id in (
  select id from source_items union select id from duplicate_items) for update;
select id from public.production_stock_issue_documents where id in (select id from affected_documents) for update;
select id from public.production_stock_movements where id in (select id from source_adjustments) for update;

do $$ begin
  if (select count(*) from source_items)<>2 or (select count(*) from duplicate_items)<>2
     or (select count(*) from affected_documents)<>4 or (select count(*) from source_adjustments)<>2 then
    raise exception 'Expected exact WKB-0048 chain row counts';
  end if;
  if exists(select 1 from source_items where status<>'voided' or product_code<>'WKB-0048'
            or lot_no<>'1108260048-1' or barcode not in ('11082600480170','11082600480171'))
     or exists(select 1 from duplicate_items where status<>'confirmed' or product_code<>'WKB-0048'
            or lot_no<>'1108260048-1' or barcode not in ('11082600480170','11082600480171')) then
    raise exception 'Issue precondition failed';
  end if;
  if (select count(*) from source_items s join duplicate_items d using(source_receipt_id)
      where s.barcode=d.barcode and s.weight_kg=d.weight_kg)<>2 then
    raise exception 'Source/duplicate pairing failed';
  end if;
  if exists(select 1 from affected_documents d where
            (select count(*) from public.production_stock_issue_items i where i.issue_document_id=d.id)<>1) then
    raise exception 'Affected document has unexpected extra items';
  end if;
  if (select count(*) from public.production_stock_movements m
      where m.movement_type='return_in' and m.metadata->>'sourceIssueItemId' in
      ('8f1f5f0f-c6c6-4e59-a7cf-7f1c0a06390c','e1ac2b3c-92d6-4e49-891c-44c609cbb07b'))<>2
     or exists(select 1 from public.production_stock_movements m
      where m.movement_type in ('return_in','waste_out') and m.metadata->>'sourceIssueItemId' in
      ('862173b3-0568-48df-8cca-ba3171002680','6f038536-ca1c-4731-bd74-0c939fe25a08')) then
    raise exception 'Child movement precondition failed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'duplicateItems',(select jsonb_agg(to_jsonb(x)) from duplicate_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x),'adjustments',(select jsonb_agg(to_jsonb(x)) from source_adjustments x))) to '.backups/wkb0048-return-chain-repair-before.json'
\endif

update public.production_stock_issue_items set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260907',jsonb_build_object('action','restore_source_issue'))
where id in (select id from source_items);
update public.production_stock_issue_documents set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260907',jsonb_build_object('action','restore_source_issue'))
where id in (select issue_document_id from source_items);

update public.production_stock_issue_items set status='voided',voided_at=now(),voided_by=null,
  void_reason='แก้ประวัติซ้ำ: รายการต้นทางเดิมมีรายการชั่งคืนอยู่แล้ว',
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260907',jsonb_build_object('action','void_duplicate_root_issue'))
where id in (select id from duplicate_items);
update public.production_stock_issue_documents set status='voided',voided_at=now(),voided_by=null,
  void_reason='แก้ประวัติการเบิกต้นทางซ้ำ หลังรายการเดิมมีการชั่งคืน',
  metadata=metadata||jsonb_build_object('historicalReturnChainRepair20260907',jsonb_build_object('action','void_duplicate_root_issue'))
where id in (select issue_document_id from duplicate_items);

update public.production_stock_movements m set metadata=m.metadata||jsonb_build_object(
  'historicalReturnChainRepair20260907',jsonb_build_object(
    'effectiveReversalOfIssueItemId',(select d.id from duplicate_items d join source_items s using(source_receipt_id)
      where s.id=(m.metadata->>'issueItemId')::uuid),
    'originalCancelledIssueItemId',m.metadata->>'issueItemId'))
where id in (select id from source_adjustments);

do $$ begin
  if (select count(*) from public.production_stock_issue_items where id in (select id from source_items) and status='confirmed')<>2
     or (select count(*) from public.production_stock_issue_items where id in (select id from duplicate_items) and status='voided')<>2 then
    raise exception 'Repair verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
