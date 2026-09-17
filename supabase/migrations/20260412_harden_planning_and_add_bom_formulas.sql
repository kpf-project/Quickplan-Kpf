-- purpose:
-- 1) add first-class formula table for multi-formula BOM per SKU
-- 2) harden production_plan_status with constraints, indexes, and rls policies
-- 3) keep backward compatibility with existing data and APIs

insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('production-line-planning-view', 'Production Line Planning (View)', '/production-line/planning/plan', 'production-line', now()),
  ('production-line-planning-manage', 'Production Line Planning (Manage)', '/production-line/planning/plan', 'production-line', now())
on conflict (perm_key) do nothing;

create table if not exists public.production_bom_formulas (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.production_boms(id) on delete cascade,
  formula_code text not null default 'DEFAULT',
  formula_name text not null default 'สูตรหลัก',
  is_active boolean not null default true,
  is_default boolean not null default false,
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_bom_formulas_formula_code_check
    check (length(trim(formula_code)) > 0)
);

create unique index if not exists production_bom_formulas_bom_code_uidx
  on public.production_bom_formulas (bom_id, formula_code);

create unique index if not exists production_bom_formulas_one_default_uidx
  on public.production_bom_formulas (bom_id)
  where is_default = true;

create index if not exists production_bom_formulas_bom_active_idx
  on public.production_bom_formulas (bom_id, is_active, formula_code);

drop trigger if exists production_bom_formulas_set_updated_at on public.production_bom_formulas;
create trigger production_bom_formulas_set_updated_at
  before update on public.production_bom_formulas
  for each row execute procedure public.set_updated_at();

alter table if exists public.production_bom_versions
  alter column formula_code set default 'DEFAULT';

alter table if exists public.production_bom_versions
  alter column formula_name set default 'สูตรหลัก';

update public.production_bom_versions
set formula_code = coalesce(nullif(trim(formula_code), ''), 'DEFAULT'),
    formula_name = coalesce(nullif(trim(formula_name), ''), 'สูตรหลัก')
where formula_code is null
   or trim(formula_code) = ''
   or formula_name is null
   or trim(formula_name) = '';

alter table if exists public.production_bom_versions
  alter column formula_code set not null;

alter table if exists public.production_bom_versions
  alter column formula_name set not null;

insert into public.production_bom_formulas (
  bom_id,
  formula_code,
  formula_name,
  is_active,
  is_default,
  note
)
select
  v.bom_id,
  v.formula_code,
  max(v.formula_name) as formula_name,
  true as is_active,
  case when v.formula_code = 'DEFAULT' then true else false end as is_default,
  null as note
from public.production_bom_versions v
group by v.bom_id, v.formula_code
on conflict (bom_id, formula_code) do update
set formula_name = excluded.formula_name;

insert into public.production_bom_formulas (
  bom_id,
  formula_code,
  formula_name,
  is_active,
  is_default
)
select
  b.id,
  'DEFAULT',
  'สูตรหลัก',
  true,
  true
from public.production_boms b
where not exists (
  select 1
  from public.production_bom_formulas f
  where f.bom_id = b.id
)
on conflict (bom_id, formula_code) do nothing;

update public.production_bom_formulas f
set is_default = true
where f.formula_code = 'DEFAULT'
  and not exists (
    select 1
    from public.production_bom_formulas f2
    where f2.bom_id = f.bom_id
      and f2.is_default = true
  );

alter table if exists public.production_bom_versions
  drop constraint if exists production_bom_versions_formula_fk;

alter table if exists public.production_bom_versions
  add constraint production_bom_versions_formula_fk
  foreign key (bom_id, formula_code)
  references public.production_bom_formulas (bom_id, formula_code)
  on update cascade
  on delete restrict
  not valid;

alter table if exists public.production_plan_status
  add column if not exists formula_code text,
  add column if not exists formula_name text,
  add column if not exists bom_version_id uuid;

alter table if exists public.production_plan_status
  alter column status set default 'not_ready';

update public.production_plan_status
set status = 'not_ready'
where status is null
   or trim(status) = '';

alter table if exists public.production_plan_status
  alter column status set not null;

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_status_check;

alter table if exists public.production_plan_status
  add constraint production_plan_status_status_check
  check (status in ('ready', 'not_ready'));

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_sku_code_fk;

alter table if exists public.production_plan_status
  add constraint production_plan_status_sku_code_fk
  foreign key (sku_code)
  references public.products_cache (sku_code)
  on update cascade
  on delete restrict
  not valid;

create index if not exists idx_plan_status_status_confirmed_at
  on public.production_plan_status (status, confirmed_at desc);

create index if not exists idx_plan_status_group_kind_status_inserted
  on public.production_plan_status (plan_group_id, plan_kind, status, inserted_at);

create index if not exists idx_plan_status_main_ready_range
  on public.production_plan_status (period_start, period_end, inserted_at)
  where plan_kind = 'main' and status = 'ready';

create index if not exists idx_plan_status_sku_formula
  on public.production_plan_status (sku_code, formula_code, bom_version_id);

alter table public.production_bom_formulas enable row level security;
alter table public.production_plan_status enable row level security;

drop policy if exists production_bom_formulas_read on public.production_bom_formulas;
create policy production_bom_formulas_read
  on public.production_bom_formulas
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_formulas_manage on public.production_bom_formulas;
create policy production_bom_formulas_manage
  on public.production_bom_formulas
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_plan_status_read on public.production_plan_status;
create policy production_plan_status_read
  on public.production_plan_status
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_status_manage on public.production_plan_status;
create policy production_plan_status_manage
  on public.production_plan_status
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
  );
