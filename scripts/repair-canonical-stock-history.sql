-- Make proven duplicate-chain repairs effective from their original event time.
-- This changes only rows already tagged by the three reviewed repair jobs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table affected_items as
select * from public.production_stock_issue_items
where (product_code,lot_no) in (
  ('WKB-0002','0207260002-1'),('WKB-0048','1108260048-1'),('WKB-0053','2408260053-1')
) and (
  metadata #>> '{historicalCorrection20260907,action}' in ('restore_source_issue','void_duplicate_original_barcode_issue')
  or metadata #>> '{historicalReturnChainRepair20260907,action}' in ('restore_source_issue','void_duplicate_root_issue')
  or metadata #>> '{historicalReturnChainRepair20260908,action}' in ('restore_source_issue','void_duplicate_root_issue')
);

create temp table affected_documents as
select * from public.production_stock_issue_documents
where id in (select issue_document_id from affected_items);

select id from public.production_stock_issue_items
where id in (select id from affected_items) for update;
select id from public.production_stock_issue_documents
where id in (select id from affected_documents) for update;

do $$
begin
  if (select count(*) from affected_items) <> 10
     or (select count(*) from affected_documents) <> 10 then
    raise exception 'Expected exactly 10 repaired items and 10 repaired documents';
  end if;
  if exists (
    select 1 from affected_items
    where product_code not in ('WKB-0002','WKB-0048','WKB-0053')
  ) then
    raise exception 'Repair scope contains an unexpected product';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('items',(select jsonb_agg(to_jsonb(x)) from affected_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x))) to '.backups/canonical-stock-history-before.json'
\endif

update public.production_stock_issue_items i
set restored_at=case when i.product_code='WKB-0053' then timestamptz '2026-09-05 00:00:00+07' else null end,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom',case when i.product_code='WKB-0053' then '2026-09-05T00:00:00+07:00' else 'creation' end,'previousRestoredAt',i.restored_at))
where i.id in (select id from affected_items)
  and (
    i.metadata #>> '{historicalCorrection20260907,action}'='restore_source_issue'
    or i.metadata #>> '{historicalReturnChainRepair20260907,action}'='restore_source_issue'
    or i.metadata #>> '{historicalReturnChainRepair20260908,action}'='restore_source_issue'
  );

update public.production_stock_issue_documents d
set restored_at=case when exists (
      select 1 from affected_items i where i.issue_document_id=d.id and i.product_code='WKB-0053'
    ) then timestamptz '2026-09-05 00:00:00+07' else null end,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom',case when exists (select 1 from affected_items i where i.issue_document_id=d.id and i.product_code='WKB-0053') then '2026-09-05T00:00:00+07:00' else 'creation' end,'previousRestoredAt',d.restored_at))
where d.id in (select id from affected_documents)
  and (
    d.metadata #>> '{historicalCorrection20260907,action}'='restore_source_issue'
    or d.metadata #>> '{historicalReturnChainRepair20260907,action}'='restore_source_issue'
    or d.metadata #>> '{historicalReturnChainRepair20260908,action}'='restore_source_issue'
  );

update public.production_stock_issue_items i
set voided_at=case when i.product_code='WKB-0053' then timestamptz '2026-09-05 00:00:00+07' else i.created_at end,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom',case when i.product_code='WKB-0053' then '2026-09-05T00:00:00+07:00' else 'creation' end,'previousVoidedAt',i.voided_at))
where i.id in (select id from affected_items)
  and (
    i.metadata #>> '{historicalCorrection20260907,action}'='void_duplicate_original_barcode_issue'
    or i.metadata #>> '{historicalReturnChainRepair20260907,action}'='void_duplicate_root_issue'
    or i.metadata #>> '{historicalReturnChainRepair20260908,action}'='void_duplicate_root_issue'
  );

update public.production_stock_issue_documents d
set voided_at=case when exists (
      select 1 from affected_items i where i.issue_document_id=d.id and i.product_code='WKB-0053'
    ) then timestamptz '2026-09-05 00:00:00+07' else d.issued_at end,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom',case when exists (select 1 from affected_items i where i.issue_document_id=d.id and i.product_code='WKB-0053') then '2026-09-05T00:00:00+07:00' else 'creation' end,'previousVoidedAt',d.voided_at))
where d.id in (select id from affected_documents)
  and (
    d.metadata #>> '{historicalCorrection20260907,action}'='void_duplicate_original_barcode_issue'
    or d.metadata #>> '{historicalReturnChainRepair20260907,action}'='void_duplicate_root_issue'
    or d.metadata #>> '{historicalReturnChainRepair20260908,action}'='void_duplicate_root_issue'
  );

select date_from, product_code, lot_no, balance_quantity, balance_weight_kg
from (values (date '2026-09-01'),(date '2026-09-02'),(date '2026-09-03'),(date '2026-09-04')) dates(date_from)
cross join lateral public.get_production_stock_opening_as_of(
  (select id from public.production_departments where code='KP13' limit 1),
  '03', dates.date_from,
  ((dates.date_from+1)::timestamp at time zone 'Asia/Bangkok'),
  null, array['WKB-0002','WKB-0048','WKB-0053']
) rows
where (rows.product_code,rows.lot_no) in (
  ('WKB-0002','0207260002-1'),('WKB-0048','1108260048-1'),('WKB-0053','2408260053-1')
)
order by date_from,product_code,lot_no;

do $$
begin
  if exists (
    select 1
    from (values (date '2026-09-01'),(date '2026-09-02'),(date '2026-09-03'),(date '2026-09-04')) dates(date_from)
    cross join lateral public.get_production_stock_opening_as_of(
      (select id from public.production_departments where code='KP13' limit 1),
      '03', dates.date_from,
      ((dates.date_from+1)::timestamp at time zone 'Asia/Bangkok'),
      null, array['WKB-0002','WKB-0048','WKB-0053']
    ) rows
    where (rows.product_code,rows.lot_no) in (
      ('WKB-0002','0207260002-1'),('WKB-0048','1108260048-1'),('WKB-0053','2408260053-1')
    ) and (rows.balance_quantity<0 or rows.balance_weight_kg<0)
  ) then
    raise exception 'Negative opening remains after canonical history repair';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
