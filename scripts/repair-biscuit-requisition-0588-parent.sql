begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table before_mapping as
select *
from public.production_requisition_group_batches
where master_plan_no = 'MP202609004'
  and document_no = 'X6909/0588'
for update;

do $$
begin
  if (select count(*) from before_mapping) <> 1 or not exists (
    select 1 from before_mapping
    where metadata->>'selectedDate' = '2026-09-28'
      and metadata->>'roomId' = '9df879aa-df22-4f9d-ad54-e30ac5ec5e9e'
      and metadata->>'parentSku' = 'B01-1008'
      and metadata->>'externalHistoricalMapping' = 'true'
  ) then
    raise exception 'X6909/0588 mapping precondition failed';
  end if;

  if not exists (select 1 from public.products_cache where sku_code = 'B06-0006') then
    raise exception 'B06-0006 does not exist in products_cache';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(b) from before_mapping b) to '.backups/requisition-X6909-0588-parent-before.json'
\endif

update public.production_requisition_group_batches g
set metadata = jsonb_set(
  jsonb_set(g.metadata, '{parentSku}', to_jsonb('B06-0006'::text), true),
  '{parentSkuName}',
  to_jsonb(coalesce((select sku_name from public.products_cache where sku_code = 'B06-0006' limit 1), 'B06-0006')),
  true
) || jsonb_build_object(
  'mappingCorrection', jsonb_build_object(
    'fromParentSku', 'B01-1008',
    'toParentSku', 'B06-0006',
    'reason', 'แก้รายการที่จับคู่ผิดจนทำให้หน้า Preview วันที่ 28 แสดงสินค้าใหม่ในห้องแครกเกอร์',
    'correctedAt', now()
  )
)
where g.id in (select id from before_mapping);

do $$
begin
  if not exists (
    select 1
    from public.production_requisition_group_batches
    where id in (select id from before_mapping)
      and metadata->>'parentSku' = 'B06-0006'
      and metadata->>'roomId' = '9df879aa-df22-4f9d-ad54-e30ac5ec5e9e'
  ) then
    raise exception 'X6909/0588 correction verification failed';
  end if;
end;
$$;

select document_no, metadata->>'roomLabel', metadata->>'parentSku', metadata->>'parentSkuName'
from public.production_requisition_group_batches
where id in (select id from before_mapping);

\if :APPLY
commit;
\else
rollback;
\endif
