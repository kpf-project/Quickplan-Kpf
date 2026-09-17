-- P1: Add policy-driven planning fields and statuses
-- Aligns production_plan_status with mixed BOM constrained planning spec.

alter table if exists public.production_plan_status
  add column if not exists feasible_batch numeric,
  add column if not exists short_batch numeric,
  add column if not exists backorder_batch numeric,
  add column if not exists earliest_material_eta date,
  add column if not exists exception_reason text;

-- Backfill for existing rows so report/workbench has stable values.
update public.production_plan_status
set feasible_batch = coalesce(feasible_batch, planned_qty, 0),
    short_batch = coalesce(short_batch, 0),
    backorder_batch = coalesce(backorder_batch, 0)
where feasible_batch is null
   or short_batch is null
   or backorder_batch is null;

-- Keep legacy values for backward compatibility while enabling policy statuses.
alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_status_check;

alter table if exists public.production_plan_status
  add constraint production_plan_status_status_check
  check (
    status is null
    or status in (
      'draft',
      'not_ready',
      'ready',
      'partial',
      'backorder',
      'blocked',
      'cancelled'
    )
  );

create index if not exists production_plan_status_policy_idx
  on public.production_plan_status (status, earliest_material_eta, period_start);

create index if not exists production_plan_status_exception_idx
  on public.production_plan_status (status, owner_department_id, period_start, due_date);
