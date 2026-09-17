begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as
select * from public.production_stock_issue_items
where id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4');
create temp table duplicate_items as
select * from public.production_stock_issue_items
where id in ('c4228259-5b64-4eaa-a81b-3c9e90da9b3c','794f2116-07aa-48df-a63b-948e3d82da06');
create temp table return_items as
select * from public.production_stock_issue_items
where id in ('0ff4ff86-1a0f-4871-8916-34a7385435ec','5d7cef03-4aa2-41f7-996c-5bb3cb1194ed');
create temp table affected_documents as
select d.* from public.production_stock_issue_documents d
where d.id in (select issue_document_id from source_items union select issue_document_id from duplicate_items);
create temp table affected_adjustments as
select m.* from public.production_stock_movements m
where m.id in ('2af25506-faf9-4f2a-8907-deca9f7f9a03','dc090d01-1312-4294-acbd-bb49a617b050');
create temp table affected_returns as
select r.* from public.production_weight_receipts r
where r.id in ('8b12cdff-507e-4099-b2f0-820e53d4ef12','6cd3eb3b-710e-43e7-b65a-38e5e9bc34fd');

select i.id from public.production_stock_issue_items i where i.id in (select id from source_items union select id from duplicate_items union select id from return_items) for update;
select d.id from public.production_stock_issue_documents d where d.id in (select id from affected_documents) for update;
select m.id from public.production_stock_movements m where m.id in (select id from affected_adjustments) for update;
select r.id from public.production_weight_receipts r where r.id in (select id from affected_returns) for update;

do $$ begin
if (select count(*) from source_items)<>2 or (select count(*) from duplicate_items)<>2 or (select count(*) from return_items)<>2 or (select count(*) from affected_documents)<>4 or (select count(*) from affected_adjustments)<>2 or (select count(*) from affected_returns)<>2 then raise exception 'Expected exact 2-row chains'; end if;
if exists(select 1 from source_items where status<>'voided' or product_code<>'WKB-0053' or lot_no<>'2408260053-1') then raise exception 'Source item precondition failed'; end if;
if exists(select 1 from duplicate_items where status<>'confirmed' or product_code<>'WKB-0053' or lot_no<>'2408260053-1' or barcode not in ('24082600530147','24082600530148')) then raise exception 'Duplicate item precondition failed'; end if;
if exists(select 1 from source_items s join duplicate_items d using(source_receipt_id) where s.barcode<>d.barcode or s.weight_kg<>d.weight_kg) then raise exception 'Source/duplicate mismatch'; end if;
if (select count(*) from source_items s join duplicate_items d using(source_receipt_id))<>2 then raise exception 'Source/duplicate pairing failed'; end if;
if exists(select 1 from return_items where status<>'confirmed' or barcode not in ('24082600530147X01','24082600530148X01')) then raise exception 'Return issue precondition failed'; end if;
if exists(select 1 from affected_returns where status<>'recorded' or net_weight_kg not in (10.49,11.06)) then raise exception 'Return receipt precondition failed'; end if;
if exists(select 1 from affected_adjustments where movement_type<>'adjustment_in' or weight_in_kg not in (18.71,18.21) or metadata->>'reversedMovementType'<>'issue_out') then raise exception 'Adjustment precondition failed'; end if;
if exists(select 1 from affected_documents d join source_items i on i.issue_document_id=d.id where d.status<>'voided' or d.issue_date<>'2026-08-28') then raise exception 'Source document precondition failed'; end if;
if exists(select 1 from affected_documents d join duplicate_items i on i.issue_document_id=d.id where d.status<>'confirmed' or d.issue_date<>'2026-09-01') then raise exception 'Duplicate document precondition failed'; end if;
if exists(select 1 from affected_documents d where (select count(*) from public.production_stock_issue_items i where i.issue_document_id=d.id)<>1) then raise exception 'Affected document has unexpected extra items'; end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'duplicateItems',(select jsonb_agg(to_jsonb(x)) from duplicate_items x),'returnItems',(select jsonb_agg(to_jsonb(x)) from return_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x),'adjustments',(select jsonb_agg(to_jsonb(x)) from affected_adjustments x),'returnReceipts',(select jsonb_agg(to_jsonb(x)) from affected_returns x))) to '.backups/wkb0053-lot-240826-reconcile-before.json'
\endif

update public.production_stock_issue_items i
set status='voided',voided_at=now(),void_reason='แก้ประวัติซ้ำ: บาร์โค้ดเดิมถูกนำกลับมาเบิกหลังยกเลิกต้นทางที่มีรายการคืน',
    metadata=i.metadata || jsonb_build_object('historicalCorrection20260907',jsonb_build_object('action','void_duplicate_original_barcode_issue','sourceIssueItemId',(select s.id from source_items s where s.source_receipt_id=i.source_receipt_id),'reason','Original issue had valid return child; duplicate reissue must not remain active'))
where i.id in (select id from duplicate_items);

update public.production_stock_issue_documents d
set status='voided',voided_at=now(),void_reason='แก้ประวัติการเบิกบาร์โค้ดเดิมซ้ำ หลังรายการต้นทางมีการคืนสินค้า',
    metadata=d.metadata || jsonb_build_object('historicalCorrection20260907',jsonb_build_object('action','void_duplicate_original_barcode_issue','reason','Reconciled WKB-0053 lot 2408260053-1'))
where d.id in (select issue_document_id from duplicate_items);

update public.production_stock_issue_items i
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
    metadata=i.metadata || jsonb_build_object('historicalCorrection20260907',jsonb_build_object('action','restore_source_issue','reason','Return child was valid; source cancellation created duplicate stock availability'))
where i.id in (select id from source_items);

update public.production_stock_issue_documents d
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
    metadata=d.metadata || jsonb_build_object('historicalCorrection20260907',jsonb_build_object('action','restore_source_issue','reason','Return child was valid; source cancellation created duplicate stock availability'))
where d.id in (select issue_document_id from source_items);

update public.production_stock_movements m
set metadata=m.metadata || jsonb_build_object('historicalCorrection20260907',jsonb_build_object('effectiveReversalOfIssueItemId',(select d.id from duplicate_items d join source_items s using(source_receipt_id) where s.id=(m.metadata->>'issueItemId')::uuid),'originalCancelledIssueItemId',m.metadata->>'issueItemId','reason','Numeric reversal retained to offset duplicate Sep 1 issue; source Aug 28 issue restored'))
where m.id in (select id from affected_adjustments);

do $$ begin
if exists(select 1 from public.production_stock_issue_items where id in (select id from source_items) and status<>'confirmed') then raise exception 'Source restore verification failed'; end if;
if exists(select 1 from public.production_stock_issue_items where id in (select id from duplicate_items) and status<>'voided') then raise exception 'Duplicate void verification failed'; end if;
if (select count(*) from public.production_stock_issue_items where id in (select id from return_items) and status='confirmed')<>2 then raise exception 'Return issues changed unexpectedly'; end if;
if exists(select 1 from public.production_weight_receipts r join affected_returns b on b.id=r.id where to_jsonb(r)<>to_jsonb(b)) then raise exception 'Return receipt changed unexpectedly'; end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
