-- Sprint 1: Governance + IDs
-- 1) baseline planning permission matrix
-- 2) owner_department model for product scope + plan item
-- 3) first-class Master/Sub plan identifiers

insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('plan.view_all', 'Plan View All', '/production-line/planning/master?ability=plan.view_all', 'production-line', now()),
  ('plan.publish_master', 'Plan Publish Master', '/production-line/planning/master?ability=plan.publish_master', 'production-line', now()),
  ('plan.calculate_own_dept', 'Plan Calculate Own Department', '/production-line/planning/plan?ability=plan.calculate_own_dept', 'production-line', now()),
  ('plan.edit_own_dept', 'Plan Edit Own Department', '/production-line/planning/plan?ability=plan.edit_own_dept', 'production-line', now()),
  ('plan.approve_exception', 'Plan Approve Exception', '/production-line/planning/report?ability=plan.approve_exception', 'production-line', now())
on conflict (perm_key) do update
set
  label = excluded.label,
  path = excluded.path,
  group_key = excluded.group_key,
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.perm_key in (
    'plan.view_all',
    'plan.publish_master',
    'plan.calculate_own_dept',
    'plan.edit_own_dept',
    'plan.approve_exception'
  )
where r.role_key = 'admin'
on conflict do nothing;

alter table if exists public.production_department_products
  add column if not exists is_owner boolean not null default false;

create unique index if not exists production_department_products_owner_sku_unique
  on public.production_department_products (sku_code)
  where is_owner = true;

create index if not exists production_department_products_department_owner_idx
  on public.production_department_products (department_id, is_owner);

with first_owner as (
  select min(id) as id
  from public.production_department_products
  group by sku_code
)
update public.production_department_products pdp
set is_owner = true
from first_owner fo
where pdp.id = fo.id
  and pdp.is_owner = false;

create table if not exists public.production_master_plans (
  id bigserial primary key,
  master_plan_no text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  published_by_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_master_plans_status_check
    check (status in ('draft', 'published', 'closed', 'cancelled'))
);

create index if not exists production_master_plans_period_idx
  on public.production_master_plans (period_start, period_end);

create index if not exists production_master_plans_status_idx
  on public.production_master_plans (status, updated_at desc);

drop trigger if exists production_master_plans_set_updated_at on public.production_master_plans;
create trigger production_master_plans_set_updated_at
  before update on public.production_master_plans
  for each row execute function public.set_updated_at();

create table if not exists public.production_sub_plans (
  id bigserial primary key,
  sub_plan_no text not null unique,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  status text not null default 'draft',
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_by_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_sub_plans_status_check
    check (status in ('draft', 'in_progress', 'confirmed', 'partial', 'backorder', 'blocked', 'cancelled')),
  constraint production_sub_plans_master_dept_unique unique (master_plan_no, department_id)
);

create index if not exists production_sub_plans_master_idx
  on public.production_sub_plans (master_plan_no, status);

create index if not exists production_sub_plans_department_idx
  on public.production_sub_plans (department_id, status, updated_at desc);

drop trigger if exists production_sub_plans_set_updated_at on public.production_sub_plans;
create trigger production_sub_plans_set_updated_at
  before update on public.production_sub_plans
  for each row execute function public.set_updated_at();

alter table if exists public.production_plan_status
  add column if not exists master_plan_no text,
  add column if not exists sub_plan_no text,
  add column if not exists owner_department_id uuid references public.production_departments(id) on delete set null;

update public.production_plan_status
set master_plan_no = coalesce(nullif(trim(master_plan_no), ''), nullif(trim(plan_group_id), ''))
where coalesce(nullif(trim(master_plan_no), ''), '') = ''
  and coalesce(nullif(trim(plan_group_id), ''), '') <> '';

with owner_map as (
  select distinct on (upper(trim(pdp.sku_code)))
    upper(trim(pdp.sku_code)) as sku_code,
    pdp.department_id
  from public.production_department_products pdp
  order by upper(trim(pdp.sku_code)), pdp.is_owner desc, pdp.id asc
)
update public.production_plan_status pps
set owner_department_id = om.department_id
from owner_map om
where upper(trim(pps.sku_code)) = om.sku_code
  and pps.owner_department_id is null;

create index if not exists production_plan_status_master_plan_no_idx
  on public.production_plan_status (master_plan_no, plan_kind, status, inserted_at);

create index if not exists production_plan_status_sub_plan_no_idx
  on public.production_plan_status (sub_plan_no, status, inserted_at);

create index if not exists production_plan_status_owner_department_idx
  on public.production_plan_status (owner_department_id, status, inserted_at);

alter table public.production_master_plans enable row level security;
alter table public.production_sub_plans enable row level security;

drop policy if exists production_master_plans_read on public.production_master_plans;
create policy production_master_plans_read
  on public.production_master_plans
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.calculate_own_dept')
    or public.has_permission('plan.edit_own_dept')
  );

drop policy if exists production_master_plans_manage on public.production_master_plans;
create policy production_master_plans_manage
  on public.production_master_plans
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.approve_exception')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.approve_exception')
  );

drop policy if exists production_sub_plans_read on public.production_sub_plans;
create policy production_sub_plans_read
  on public.production_sub_plans
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.calculate_own_dept')
    or public.has_permission('plan.edit_own_dept')
  );

drop policy if exists production_sub_plans_manage on public.production_sub_plans;
create policy production_sub_plans_manage
  on public.production_sub_plans
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.approve_exception')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.publish_master')
    or public.has_permission('plan.approve_exception')
  );
