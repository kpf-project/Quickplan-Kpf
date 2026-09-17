-- Restate the two repaired WKB-0053 return chains from their real event dates.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as
select * from public.production_stock_issue_items
where id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4');
create temp table duplicate_items as
select * from public.production_stock_issue_items
where id in ('c4228259-5b64-4eaa-a81b-3c9e90da9b3c','794f2116-07aa-48df-a63b-948e3d82da06');
create temp table affected_documents as
select * from public.production_stock_issue_documents
where id in (select issue_document_id from source_items union select issue_document_id from duplicate_items);

select id from public.production_stock_issue_items
where id in (select id from source_items union select id from duplicate_items) for update;
select id from public.production_stock_issue_documents
where id in (select id from affected_documents) for update;

do $$ begin
  if (select count(*) from source_items)<>2 or (select count(*) from duplicate_items)<>2
     or (select count(*) from affected_documents)<>4 then
    raise exception 'Expected exact two WKB-0053 repaired chains';
  end if;
  if exists(select 1 from source_items where status<>'confirmed' or restored_at is null
            or metadata #>> '{historicalCorrection20260907,action}'<>'restore_source_issue') then
    raise exception 'Source item precondition failed';
  end if;
  if exists(select 1 from duplicate_items where status<>'voided' or voided_at is null
            or metadata #>> '{historicalCorrection20260907,action}'<>'void_duplicate_original_barcode_issue') then
    raise exception 'Duplicate item precondition failed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'duplicateItems',(select jsonb_agg(to_jsonb(x)) from duplicate_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x))) to '.backups/wkb0053-canonical-history-before.json'
\endif

update public.production_stock_issue_items i
set restored_at=null,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRestatement20260909',
      jsonb_build_object('effectiveFrom','creation','previousRestoredAt',i.restored_at))
where i.id in (select id from source_items);
update public.production_stock_issue_documents d
set restored_at=null,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRestatement20260909',
      jsonb_build_object('effectiveFrom','creation','previousRestoredAt',d.restored_at))
where d.id in (select issue_document_id from source_items);

update public.production_stock_issue_items i
set voided_at=i.created_at,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRestatement20260909',
      jsonb_build_object('effectiveFrom','creation','previousVoidedAt',i.voided_at))
where i.id in (select id from duplicate_items);
update public.production_stock_issue_documents d
set voided_at=d.issued_at,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRestatement20260909',
      jsonb_build_object('effectiveFrom','creation','previousVoidedAt',d.voided_at))
where d.id in (select issue_document_id from duplicate_items);

do $$ declare r record; begin
  for r in
    select dates.report_date,rows.balance_quantity,rows.balance_weight_kg
    from (values (date '2026-09-01'),(date '2026-09-02'),(date '2026-09-03'),(date '2026-09-04')) dates(report_date)
    cross join lateral public.get_production_stock_opening_as_of(
      (select id from public.production_departments where code='KP13' limit 1),
      '03',dates.report_date,
      ((dates.report_date+1)::timestamp at time zone 'Asia/Bangkok')-interval '1 millisecond',
      null,array['WKB-0053']) rows
    where rows.lot_no='2408260053-1'
  loop
    raise notice '% opening: % / %',r.report_date,r.balance_quantity,r.balance_weight_kg;
    if r.balance_quantity<0 or r.balance_weight_kg<0 then
      raise exception 'Negative opening remains on %',r.report_date;
    end if;
  end loop;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
