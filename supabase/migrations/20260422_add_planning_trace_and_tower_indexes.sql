-- Performance indexes for planning trace workloads
-- Aligned with API query patterns in:
-- - /api/production-planning/trace

create index if not exists production_plan_status_tower_window_idx
  on public.production_plan_status (status, period_start, period_end, owner_department_id, plan_kind);

create index if not exists production_plan_status_trace_master_idx
  on public.production_plan_status (master_plan_no, status, period_start desc, period_end desc);

create index if not exists production_plan_status_trace_master_owner_idx
  on public.production_plan_status (master_plan_no, owner_department_id, status, period_start desc, period_end desc);
