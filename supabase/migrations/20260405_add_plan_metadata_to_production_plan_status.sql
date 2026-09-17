-- Add plan metadata to distinguish weekly main plans and sub-plans
-- Supports auto-classification, T+N due dates, and clear reporting/audit

alter table if exists public.production_plan_status
  add column if not exists plan_kind text,
  add column if not exists plan_group_id text,
  add column if not exists parent_plan_id text,
  add column if not exists entry_date date,
  add column if not exists t_plus_days integer,
  add column if not exists due_date date,
  add column if not exists plan_note text;

-- Constrain plan_kind to known values when provided
alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_plan_kind_check;

alter table if exists public.production_plan_status
  add constraint production_plan_status_plan_kind_check
  check (plan_kind is null or plan_kind in ('main','sub'));

-- Sensible defaults for new writes (server logic will still override as needed)
alter table if exists public.production_plan_status
  alter column t_plus_days set default 3;

create index if not exists idx_plan_status_group_kind
  on public.production_plan_status (plan_group_id, plan_kind);

create index if not exists idx_plan_status_group_due
  on public.production_plan_status (plan_group_id, due_date);
