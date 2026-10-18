begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table target_plan as
select *
from public.production_plan_status
where plan_id = 'WIP-MP202609004-KP13-WKB-0050-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5'
for update;

do $$
begin
  if (select count(*) from target_plan) <> 1 then
    raise exception 'Precondition failed: expected exactly 1 subplan row for WKB-0050 on 2026-09-29';
  end if;

  if exists (
    select 1 from target_plan
    where master_plan_no <> 'MP202609004'
       or period_start <> date '2026-09-29'
       or sku_code <> 'WKB-0050'
       or planned_qty <> 6
       or unit <> 'batch'
       or owner_department_id <> '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'::uuid
  ) then
    raise exception 'Target subplan row metadata mismatch';
  end if;

  if not exists (
    select 1 from public.products_cache where sku_code = 'WKB-0045'
  ) then
    raise exception 'WKB-0045 does not exist in products_cache';
  end if;

  if exists (
    select 1 from public.production_plan_status
    where plan_id = 'WIP-MP202609004-KP13-WKB-0045-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5'
  ) then
    raise exception 'WKB-0045 subplan row already exists for this master plan and date';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(t) from target_plan t) to '.backups/subplan-biscuit-wkb0050-to-wkb0045-20260929-before.json'
\endif

update public.production_plan_status
set
  plan_id = 'WIP-MP202609004-KP13-WKB-0045-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5',
  sku_code = 'WKB-0045',
  sku_name = coalesce((select sku_name from public.products_cache where sku_code = 'WKB-0045' limit 1), 'แผ่นแครกเกอร์สมุย'),
  bom_snapshot = jsonb_set(
    jsonb_set(
      jsonb_set(
        bom_snapshot,
        '{0,skuCode}',
        '"WKB-0045"'::jsonb
      ),
      '{0,skuName}',
      to_jsonb(coalesce((select sku_name from public.products_cache where sku_code = 'WKB-0045' limit 1), 'แผ่นแครกเกอร์สมุย'))
    ),
    '{0,bomVersionId}',
    '"4382d48e-ecff-4e09-8048-c9b98f159e50"'::jsonb
  ),
  updated_at = now()
where plan_id = 'WIP-MP202609004-KP13-WKB-0050-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5';

do $$
begin
  if exists (
    select 1 from public.production_plan_status
    where plan_id = 'WIP-MP202609004-KP13-WKB-0050-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5'
  ) then
    raise exception 'Old WKB-0050 row still exists after update';
  end if;

  if not exists (
    select 1 from public.production_plan_status
    where plan_id = 'WIP-MP202609004-KP13-WKB-0045-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5'
      and sku_code = 'WKB-0045'
      and planned_qty = 6
      and unit = 'batch'
      and bom_snapshot->0->>'skuCode' = 'WKB-0045'
  ) then
    raise exception 'New WKB-0045 row verification failed';
  end if;
end;
$$;

select
  plan_id,
  master_plan_no,
  period_start,
  sku_code,
  sku_name,
  planned_qty,
  unit,
  schedule_section_name,
  bom_snapshot->0->>'skuCode' as snapshot_sku,
  bom_snapshot->0->>'skuName' as snapshot_name,
  jsonb_array_length(bom_snapshot->0->'materials') as materials_count
from public.production_plan_status
where plan_id = 'WIP-MP202609004-KP13-WKB-0045-2026-09-29-SHIFT1-04FF0A3C-8998-4A48-B4DB-3B1F4BC5';

\if :APPLY
commit;
\else
rollback;
\endif
