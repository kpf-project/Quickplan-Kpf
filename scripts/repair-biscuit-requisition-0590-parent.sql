begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table before_mapping as
select *
from public.production_requisition_group_batches
where master_plan_no = 'MP202609004'
  and document_no = 'X6909/0590'
for update;

do $$
begin
  if (select count(*) from before_mapping) <> 1 or not exists (
    select 1 from before_mapping
    where metadata->>'selectedDate' = '2026-09-28'
      and metadata->>'roomId' = '391ca53a-0c14-4cdd-999b-4d1fee2405ca'
      and metadata->>'parentSku' = 'B01-1013'
      and metadata->>'externalHistoricalMapping' = 'true'
  ) then
    raise exception 'X6909/0590 mapping precondition failed';
  end if;

  if not exists (select 1 from public.products_cache where sku_code = 'BL0-1106') then
    raise exception 'BL0-1106 does not exist in products_cache';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(b) from before_mapping b) to '.backups/requisition-X6909-0590-parent-before.json'
\endif

update public.production_requisition_group_batches g
set metadata = jsonb_set(
  jsonb_set(g.metadata, '{parentSku}', to_jsonb('BL0-1106'::text), true),
  '{parentSkuName}',
  to_jsonb(coalesce((select sku_name from public.products_cache where sku_code = 'BL0-1106' limit 1), 'BL0-1106')),
  true
) || jsonb_build_object(
  'mappingCorrection', jsonb_build_object(
    'fromParentSku', 'B01-1013',
    'toParentSku', 'BL0-1106',
    'reason', 'แก้รายการที่จับคู่ผิดจนทำให้หน้า Preview วันที่ 28 แสดงสินค้าใหม่ในห้องคุกกี้ป้ายครีม',
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
      and metadata->>'parentSku' = 'BL0-1106'
      and metadata->>'roomId' = '391ca53a-0c14-4cdd-999b-4d1fee2405ca'
  ) then
    raise exception 'X6909/0590 correction verification failed';
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
