-- 1) Enforce standard Plan No patterns
-- 2) Freeze publish snapshot fields on master plans
-- 3) Add advanced scheduling (capacity + policy) model

alter table if exists public.production_master_plans
  add column if not exists snapshot_meta jsonb not null default '{}'::jsonb,
  add column if not exists snapshot_bom jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_stock jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_open_po jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_open_mo jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_lead_time jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_material_requirements jsonb not null default '[]'::jsonb,
  add column if not exists snapshot_frozen_at timestamptz,
  add column if not exists snapshot_frozen_by uuid references public.profiles(id) on delete set null;

create index if not exists production_master_plans_snapshot_frozen_idx
  on public.production_master_plans (snapshot_frozen_at desc);

alter table if exists public.production_master_plans
  drop constraint if exists production_master_plans_master_plan_no_format_check;
alter table if exists public.production_master_plans
  add constraint production_master_plans_master_plan_no_format_check
  check (master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$');

alter table if exists public.production_sub_plans
  drop constraint if exists production_sub_plans_sub_plan_no_format_check;
alter table if exists public.production_sub_plans
  add constraint production_sub_plans_sub_plan_no_format_check
  check (sub_plan_no ~ '^SP-[0-9]{4}-W[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$');

alter table if exists public.production_sub_plans
  drop constraint if exists production_sub_plans_master_plan_no_format_check;
alter table if exists public.production_sub_plans
  add constraint production_sub_plans_master_plan_no_format_check
  check (master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$');

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_master_plan_no_format_check;
alter table if exists public.production_plan_status
  add constraint production_plan_status_master_plan_no_format_check
  check (master_plan_no is null or master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$')
  not valid;

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_sub_plan_no_format_check;
alter table if exists public.production_plan_status
  add constraint production_plan_status_sub_plan_no_format_check
  check (sub_plan_no is null or sub_plan_no ~ '^SP-[0-9]{4}-W[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$')
  not valid;

create table if not exists public.production_planning_policies (
  id bigserial primary key,
  code text not null unique,
  name text not null,
  description text,
  weight_backorder numeric(12,4) not null default 5.0,
  weight_shortage numeric(12,4) not null default 3.0,
  weight_due_urgency numeric(12,4) not null default 4.0,
  weight_plan_kind_sub numeric(12,4) not null default 1.0,
  weight_plan_kind_main numeric(12,4) not null default 0.5,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

drop trigger if exists production_planning_policies_set_updated_at
  on public.production_planning_policies;
create trigger production_planning_policies_set_updated_at
  before update on public.production_planning_policies
  for each row execute procedure public.set_updated_at();

insert into public.production_planning_policies (
  code, name, description, weight_backorder, weight_shortage, weight_due_urgency, weight_plan_kind_sub, weight_plan_kind_main
)
values
  ('balanced', 'Balanced Policy', 'Default scheduling policy balancing due-date and shortage impact', 5.0, 3.0, 4.0, 1.0, 0.5),
  ('urgent_due_first', 'Urgent Due First', 'Prioritize due date urgency and existing backorder first', 6.0, 3.5, 6.5, 1.5, 0.5)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  weight_backorder = excluded.weight_backorder,
  weight_shortage = excluded.weight_shortage,
  weight_due_urgency = excluded.weight_due_urgency,
  weight_plan_kind_sub = excluded.weight_plan_kind_sub,
  weight_plan_kind_main = excluded.weight_plan_kind_main,
  updated_at = now();

create table if not exists public.production_department_capacities (
  id bigserial primary key,
  department_id uuid not null references public.production_departments(id) on delete cascade,
  work_date date not null,
  capacity_batch numeric(14,3) not null default 0,
  reserved_batch numeric(14,3) not null default 0,
  policy_code text references public.production_planning_policies(code) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_department_capacities_unique unique (department_id, work_date)
);

drop trigger if exists production_department_capacities_set_updated_at
  on public.production_department_capacities;
create trigger production_department_capacities_set_updated_at
  before update on public.production_department_capacities
  for each row execute procedure public.set_updated_at();

create index if not exists production_department_capacities_date_idx
  on public.production_department_capacities (work_date, department_id);

alter table if exists public.production_plan_status
  add column if not exists priority_score numeric(14,4),
  add column if not exists scheduling_policy_code text,
  add column if not exists scheduled_start_date date,
  add column if not exists scheduled_end_date date,
  add column if not exists scheduled_batch numeric(14,3),
  add column if not exists capacity_block_reason text;

create index if not exists production_plan_status_scheduling_idx
  on public.production_plan_status (owner_department_id, scheduled_start_date, due_date, priority_score desc);

create index if not exists production_plan_status_policy_code_idx
  on public.production_plan_status (scheduling_policy_code, status, due_date);

alter table public.production_planning_policies enable row level security;
alter table public.production_department_capacities enable row level security;

drop policy if exists production_planning_policies_read on public.production_planning_policies;
create policy production_planning_policies_read
  on public.production_planning_policies
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
  );

drop policy if exists production_planning_policies_manage on public.production_planning_policies;
create policy production_planning_policies_manage
  on public.production_planning_policies
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.approve_exception')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.approve_exception')
  );

drop policy if exists production_department_capacities_read on public.production_department_capacities;
create policy production_department_capacities_read
  on public.production_department_capacities
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
  );

drop policy if exists production_department_capacities_manage on public.production_department_capacities;
create policy production_department_capacities_manage
  on public.production_department_capacities
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.approve_exception')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.approve_exception')
  );

