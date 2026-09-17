begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as select * from public.production_stock_issue_items
where id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4');
create temp table sep1_reissues as select * from public.production_stock_issue_items
where id in ('c4228259-5b64-4eaa-a81b-3c9e90da9b3c','794f2116-07aa-48df-a63b-948e3d82da06');
create temp table false_return_receipts as select * from public.production_weight_receipts
where id in ('8b12cdff-507e-4099-b2f0-820e53d4ef12','6cd3eb3b-710e-43e7-b65a-38e5e9bc34fd');
create temp table false_return_issues as select * from public.production_stock_issue_items
where id in ('0ff4ff86-1a0f-4871-8916-34a7385435ec','5d7cef03-4aa2-41f7-996c-5bb3cb1194ed');
create temp table affected_documents as select * from public.production_stock_issue_documents
where id in (select issue_document_id from source_items union select issue_document_id from sep1_reissues
             union select issue_document_id from false_return_issues);
create temp table false_return_movements as select * from public.production_stock_movements
where movement_type='return_in' and metadata->>'sourceIssueItemId' in
  ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4');

select id from public.production_stock_issue_items where id in
  (select id from source_items union select id from sep1_reissues union select id from false_return_issues) for update;
select id from public.production_stock_issue_documents where id in (select id from affected_documents) for update;
select id from public.production_weight_receipts where id in (select id from false_return_receipts) for update;
select id from public.production_stock_movements where id in (select id from false_return_movements) for update;

do $$ begin
  if (select count(*) from source_items)<>2 or (select count(*) from sep1_reissues)<>2
     or (select count(*) from false_return_receipts)<>2 or (select count(*) from false_return_issues)<>2
     or (select count(*) from affected_documents)<>6 or (select count(*) from false_return_movements)<>2 then
    raise exception 'Expected exact two complete return chains';
  end if;
  if exists(select 1 from source_items where status<>'confirmed' or barcode not in
      ('24082600530147','24082600530148') or product_code<>'WKB-0053' or lot_no<>'2408260053-1')
     or exists(select 1 from sep1_reissues where status<>'voided' or barcode not in
      ('24082600530147','24082600530148') or product_code<>'WKB-0053' or lot_no<>'2408260053-1') then
    raise exception 'Root issue precondition failed';
  end if;
  if exists(select 1 from false_return_receipts where status<>'recorded' or barcode not in
      ('24082600530147X01','24082600530148X01') or net_weight_kg not in (10.490,11.060))
     or exists(select 1 from false_return_issues where status<>'confirmed' or barcode not in
      ('24082600530147X01','24082600530148X01')) then
    raise exception 'False-return precondition failed';
  end if;
  if exists(select 1 from affected_documents d where
      (select count(*) from public.production_stock_issue_items i where i.issue_document_id=d.id)<>1) then
    raise exception 'Affected document has extra items';
  end if;
  if (select count(*) from source_items s join sep1_reissues r using(source_receipt_id)
      where s.barcode=r.barcode and s.weight_kg=r.weight_kg)<>2 then
    raise exception 'Sep 1 reissue pairing failed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'sep1Reissues',(select jsonb_agg(to_jsonb(x)) from sep1_reissues x),'falseReturnReceipts',(select jsonb_agg(to_jsonb(x)) from false_return_receipts x),'falseReturnIssues',(select jsonb_agg(to_jsonb(x)) from false_return_issues x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x),'returnMovements',(select jsonb_agg(to_jsonb(x)) from false_return_movements x))) to '.backups/wkb0053-false-returns-147-148-before.json'
\endif

alter table public.production_stock_issue_items disable trigger guard_stock_issue_cancellation_children;

update public.production_weight_receipts
set status='voided',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'receiptStatus','voided','voidedAt',timezone('utc',now()),
  'voidReason','ผู้ใช้งานยืนยันว่าไม่ได้ชั่งคืนจริง; แก้รายการ 0147/0148 เมื่อ 2026-09-09')
where id in (select id from false_return_receipts);

update public.production_stock_movements
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'historicalCorrection20260909',jsonb_build_object('action','void_false_return','reason','Operator confirmed return did not occur'))
where id in (select id from false_return_movements);

update public.production_stock_issue_items
set status='voided',voided_at=now(),voided_by=null,
    void_reason='ยกเลิกเพราะใบชั่งคืนต้นทาง 0147X01/0148X01 ไม่ได้เกิดขึ้นจริง',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'historicalCorrection20260909',jsonb_build_object('action','void_false_return_issue'))
where id in (select id from false_return_issues);
update public.production_stock_issue_documents
set status='voided',voided_at=now(),voided_by=null,
    void_reason='ยกเลิกใบเบิกของรายการชั่งคืนที่ผู้ใช้งานยืนยันว่าไม่เกิดขึ้นจริง'
where id in (select issue_document_id from false_return_issues);

update public.production_stock_issue_items
set status='voided',voided_at=coalesce((select m.created_at from public.production_stock_movements m
      where m.movement_type='adjustment_in' and m.metadata->>'issueItemId'=production_stock_issue_items.id::text
      order by m.created_at limit 1),now()),voided_by=null,
    void_reason='ผู้ใช้งานยืนยันยกเลิกใบเบิกต้นทางพร้อมยกเลิกรายการชั่งคืน 0147X01/0148X01',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'historicalCorrection20260909',jsonb_build_object('action','void_source_issue_and_false_return'))
where id in (select id from source_items);
update public.production_stock_issue_documents d
set status='voided',voided_at=coalesce((select i.voided_at from public.production_stock_issue_items i
      where i.issue_document_id=d.id limit 1),now()),voided_by=null,
    void_reason='ผู้ใช้งานยืนยันยกเลิกใบเบิกต้นทางพร้อมยกเลิกรายการชั่งคืน'
where id in (select issue_document_id from source_items);

update public.production_stock_issue_items
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,restored_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'historicalCorrection20260909',jsonb_build_object('action','restore_sep1_reissue_after_false_return_void'))
where id in (select id from sep1_reissues);
update public.production_stock_issue_documents
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,restored_at=now()
where id in (select issue_document_id from sep1_reissues);

alter table public.production_stock_issue_items enable trigger guard_stock_issue_cancellation_children;

do $$ declare v record; begin
  if exists(select 1 from public.production_weight_receipts where id in (select id from false_return_receipts) and status<>'voided')
     or exists(select 1 from public.production_stock_issue_items where id in
       (select id from source_items union select id from false_return_issues) and status<>'voided')
     or exists(select 1 from public.production_stock_issue_items where id in (select id from sep1_reissues) and status<>'confirmed') then
    raise exception 'Status verification failed';
  end if;
  select * into v from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),'03',date '2026-09-01',now(),null,array['WKB-0053'])
    where lot_no='2408260053-1';
  if v.balance_quantity<>109 or v.balance_weight_kg<>1900.000 then
    raise exception 'Sep 1 opening verification failed: %/%',v.balance_quantity,v.balance_weight_kg;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
