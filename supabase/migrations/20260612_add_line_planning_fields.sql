-- Add line-level planning fields for global production planning board.
-- Stores type linkage, staffing, machine slot, work window, and row notes
-- directly on production_plan_status so the planning UI can stay simple.

alter table if exists public.production_plan_status
  add column if not exists category_id uuid references public.production_categories(id) on delete set null,
  add column if not exists line_staff_count integer,
  add column if not exists line_machine_no integer,
  add column if not exists work_start_time time,
  add column if not exists work_end_time time,
  add column if not exists item_note text;

update public.production_plan_status p
set category_id = c.id
from public.production_categories c
where p.category_id is null
  and trim(coalesce(p.category_name, '')) <> ''
  and lower(trim(c.name)) = lower(trim(p.category_name));

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_line_staff_count_check;
alter table if exists public.production_plan_status
  add constraint production_plan_status_line_staff_count_check
  check (line_staff_count is null or line_staff_count >= 0);

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_line_machine_no_check;
alter table if exists public.production_plan_status
  add constraint production_plan_status_line_machine_no_check
  check (line_machine_no is null or line_machine_no >= 0);

create index if not exists production_plan_status_board_idx
  on public.production_plan_status (period_start, owner_department_id, category_id, status);

create index if not exists production_plan_status_category_idx
  on public.production_plan_status (category_id, period_start desc, owner_department_id);
