-- Make the two reviewed 2.950/8.280 kg return-chain repairs canonical historically.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table affected_items as
select * from public.production_stock_issue_items
where product_code='WKB-0002' and lot_no='1908260002-1'
  and metadata #>> '{historicalReturnChainRepair20260907,action}' in
    ('restore_source_issue','void_duplicate_root_issue');
create temp table affected_documents as
select * from public.production_stock_issue_documents
where id in (select issue_document_id from affected_items);

select id from public.production_stock_issue_items
where id in (select id from affected_items) for update;
select id from public.production_stock_issue_documents
where id in (select id from affected_documents) for update;

do $$ begin
  if (select count(*) from affected_items)<>4
     or (select count(*) from affected_documents)<>4 then
    raise exception 'Expected exactly four repaired items/documents';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('items',(select jsonb_agg(to_jsonb(x)) from affected_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x))) to '.backups/wkb0002-190826-canonical-history-before.json'
\endif

update public.production_stock_issue_items i
set restored_at=null,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom','creation','previousRestoredAt',i.restored_at))
where i.id in (select id from affected_items)
  and i.metadata #>> '{historicalReturnChainRepair20260907,action}'='restore_source_issue';
update public.production_stock_issue_documents d
set restored_at=null,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom','creation','previousRestoredAt',d.restored_at))
where d.id in (select issue_document_id from affected_items
  where metadata #>> '{historicalReturnChainRepair20260907,action}'='restore_source_issue');

update public.production_stock_issue_items i
set voided_at=i.created_at,
    metadata=i.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom','creation','previousVoidedAt',i.voided_at))
where i.id in (select id from affected_items)
  and i.metadata #>> '{historicalReturnChainRepair20260907,action}'='void_duplicate_root_issue';
update public.production_stock_issue_documents d
set voided_at=d.issued_at,
    metadata=d.metadata||jsonb_build_object('canonicalHistoryRepair20260908',
      jsonb_build_object('effectiveFrom','creation','previousVoidedAt',d.voided_at))
where d.id in (select issue_document_id from affected_items
  where metadata #>> '{historicalReturnChainRepair20260907,action}'='void_duplicate_root_issue');

do $$
declare v_quantity numeric; v_weight numeric; v_issue_quantity numeric; v_issue_weight numeric;
begin
  select balance_quantity,balance_weight_kg into v_quantity,v_weight
  from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',date '2026-09-01',timestamptz '2026-09-02 23:59:59.999+07',
    null,array['WKB-0002']
  ) where lot_no='1908260002-1';
  if v_quantity<>74 or v_weight<>942.820 then
    raise exception 'Expected Sep 1 opening 74 / 942.820, got % / %',v_quantity,v_weight;
  end if;

  select coalesce(sum(i.quantity),0),coalesce(sum(i.weight_kg),0)
  into v_issue_quantity,v_issue_weight
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
    and d.issue_date=date '2026-09-01'
    and d.issued_at<=timestamptz '2026-09-05 23:59:59.999+07'
    and i.created_at<=timestamptz '2026-09-05 23:59:59.999+07'
    and (d.restored_at is null or d.restored_at<=timestamptz '2026-09-05 23:59:59.999+07')
    and (i.restored_at is null or i.restored_at<=timestamptz '2026-09-05 23:59:59.999+07')
    and (d.status='confirmed' or (d.status='voided' and d.voided_at>timestamptz '2026-09-05 23:59:59.999+07'))
    and (i.status='confirmed' or (i.status='voided' and i.voided_at>timestamptz '2026-09-05 23:59:59.999+07'));
  if v_issue_quantity<>63 or v_issue_weight<>790.780 then
    raise exception 'Expected Sep 1 issue 63 / 790.780, got % / %',v_issue_quantity,v_issue_weight;
  end if;

  select balance_quantity,balance_weight_kg into v_quantity,v_weight
  from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',date '2026-09-04',timestamptz '2026-09-05 23:59:59.999+07',
    null,array['WKB-0002']
  ) where lot_no='1908260002-1';
  if v_quantity<>4 or v_weight<>47.450 then
    raise exception 'Expected Sep 4 opening 4 / 47.450, got % / %',v_quantity,v_weight;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
