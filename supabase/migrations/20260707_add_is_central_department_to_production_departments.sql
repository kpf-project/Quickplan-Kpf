alter table public.production_departments
  add column if not exists is_central_department boolean not null default false;

create index if not exists production_departments_is_central_department_idx
  on public.production_departments (is_central_department)
  where deleted_at is null;
