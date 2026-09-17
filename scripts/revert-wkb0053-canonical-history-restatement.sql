-- Revert only the 2026-09-09 WKB-0053 restatement that changed the approved Sep 1 report.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table affected_items as
select * from public.production_stock_issue_items
where product_code='WKB-0053' and lot_no='2408260053-1'
  and metadata ? 'canonicalHistoryRestatement20260909';
create temp table affected_documents as
select * from public.production_stock_issue_documents
where metadata ? 'canonicalHistoryRestatement20260909'
  and id in (select issue_document_id from affected_items);

select id from public.production_stock_issue_items where id in (select id from affected_items) for update;
select id from public.production_stock_issue_documents where id in (select id from affected_documents) for update;

do $$ begin
  if (select count(*) from affected_items)<>4 or (select count(*) from affected_documents)<>4 then
    raise exception 'Expected exactly four items and four documents from the last restatement';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('items',(select jsonb_agg(to_jsonb(x)) from affected_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x))) to '.backups/wkb0053-canonical-history-restatement-revert-before.json'
\endif

update public.production_stock_issue_items i
set restored_at=(i.metadata #>> '{canonicalHistoryRestatement20260909,previousRestoredAt}')::timestamptz,
    metadata=i.metadata-'canonicalHistoryRestatement20260909'
where i.id in (select id from affected_items)
  and metadata #>> '{historicalCorrection20260907,action}'='restore_source_issue';
update public.production_stock_issue_documents d
set restored_at=(d.metadata #>> '{canonicalHistoryRestatement20260909,previousRestoredAt}')::timestamptz,
    metadata=d.metadata-'canonicalHistoryRestatement20260909'
where d.id in (select issue_document_id from affected_items
  where metadata #>> '{historicalCorrection20260907,action}'='restore_source_issue');

update public.production_stock_issue_items i
set voided_at=(i.metadata #>> '{canonicalHistoryRestatement20260909,previousVoidedAt}')::timestamptz,
    metadata=i.metadata-'canonicalHistoryRestatement20260909'
where i.id in (select id from affected_items)
  and metadata #>> '{historicalCorrection20260907,action}'='void_duplicate_original_barcode_issue';
update public.production_stock_issue_documents d
set voided_at=(d.metadata #>> '{canonicalHistoryRestatement20260909,previousVoidedAt}')::timestamptz,
    metadata=d.metadata-'canonicalHistoryRestatement20260909'
where d.id in (select issue_document_id from affected_items
  where metadata #>> '{historicalCorrection20260907,action}'='void_duplicate_original_barcode_issue');

do $$ declare v_open_qty numeric; v_open_kg numeric; v_issue_qty numeric; v_issue_kg numeric; begin
  select balance_quantity,balance_weight_kg into v_open_qty,v_open_kg
  from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',date '2026-09-01',timestamptz '2026-09-02 23:59:59.999+07',
    null,array['WKB-0053']) where lot_no='2408260053-1';
  select sum(i.quantity),sum(i.weight_kg) into v_issue_qty,v_issue_kg
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0053' and i.lot_no='2408260053-1' and d.issue_date='2026-09-01'
    and d.issued_at<=timestamptz '2026-09-02 23:59:59.999+07'
    and i.created_at<=timestamptz '2026-09-02 23:59:59.999+07'
    and (d.restored_at is null or d.restored_at<=timestamptz '2026-09-02 23:59:59.999+07')
    and (i.restored_at is null or i.restored_at<=timestamptz '2026-09-02 23:59:59.999+07')
    and (d.status='confirmed' or (d.status='voided' and d.voided_at>timestamptz '2026-09-02 23:59:59.999+07'))
    and (i.status='confirmed' or (i.status='voided' and i.voided_at>timestamptz '2026-09-02 23:59:59.999+07'));
  if v_open_qty<>109 or v_open_kg<>1900 or v_issue_qty<>74 or v_issue_kg<>1243.22 then
    raise exception 'Sep 1 verification failed: opening %/% issue %/%',v_open_qty,v_open_kg,v_issue_qty,v_issue_kg;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
