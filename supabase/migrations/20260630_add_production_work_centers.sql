create table if not exists public.production_work_centers (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.production_departments(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  constraint production_work_centers_code_not_blank check (length(trim(code)) > 0),
  constraint production_work_centers_name_not_blank check (length(trim(name)) > 0),
  constraint production_work_centers_sort_order_check check (sort_order between 0 and 9999)
);

create unique index if not exists production_work_centers_department_code_unique
  on public.production_work_centers (department_id, lower(code))
  where deleted_at is null;

create unique index if not exists production_work_centers_department_name_unique
  on public.production_work_centers (department_id, lower(name))
  where deleted_at is null;

create index if not exists production_work_centers_department_active_idx
  on public.production_work_centers (department_id, is_active, sort_order, name)
  where deleted_at is null;

drop trigger if exists production_work_centers_set_updated_at
  on public.production_work_centers;
create trigger production_work_centers_set_updated_at
  before update on public.production_work_centers
  for each row execute function public.set_updated_at();

alter table public.production_work_centers enable row level security;

drop policy if exists production_work_centers_read on public.production_work_centers;
create policy production_work_centers_read
  on public.production_work_centers
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_work_centers_manage on public.production_work_centers;
create policy production_work_centers_manage
  on public.production_work_centers
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );
