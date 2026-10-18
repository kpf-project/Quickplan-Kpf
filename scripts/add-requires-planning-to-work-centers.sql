-- Add requires_planning column to production_work_centers
alter table public.production_work_centers
  add column if not exists requires_planning boolean not null default false;

-- Create index for planning queries
create index if not exists production_work_centers_planning_idx
  on public.production_work_centers (department_id, requires_planning, is_active, sort_order)
  where deleted_at is null;

comment on column public.production_work_centers.requires_planning is
  'Flag indicating whether this work center requires production planning (WIP planning).';
