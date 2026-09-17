alter table if exists public.production_work_types
  add column if not exists department_id uuid references public.production_departments(id) on delete restrict;

create index if not exists production_work_types_department_idx
  on public.production_work_types (department_id);

update public.production_work_types wt
set department_id = src.department_id
from (
  select distinct on (work_type_id) work_type_id, department_id
  from public.production_work_type_units
  order by work_type_id, created_at asc, id asc
) as src
where wt.id = src.work_type_id
  and wt.department_id is null;

drop index if exists production_work_types_code_unique;
drop index if exists production_work_types_name_unique;

create unique index if not exists production_work_types_department_code_unique
  on public.production_work_types (department_id, lower(code))
  where deleted_at is null;

create unique index if not exists production_work_types_department_name_unique
  on public.production_work_types (department_id, lower(name))
  where deleted_at is null;

drop table if exists public.production_work_type_units cascade;
