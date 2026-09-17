create table if not exists public.production_work_type_size_filling_mappings (
  id bigserial primary key,
  work_type_id uuid not null references public.production_work_types(id) on delete cascade,
  size_value text,
  filling_value text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint production_work_type_size_filling_mappings_filling_value_check
    check (length(trim(filling_value)) > 0),
  constraint production_work_type_size_filling_mappings_size_value_check
    check (size_value is null or length(trim(size_value)) > 0)
);

create unique index if not exists production_work_type_size_filling_mappings_unique_idx
  on public.production_work_type_size_filling_mappings (
    work_type_id,
    coalesce(lower(size_value), '__all__'),
    lower(filling_value)
  )
  where deleted_at is null;

create index if not exists production_work_type_size_filling_mappings_work_type_idx
  on public.production_work_type_size_filling_mappings (work_type_id, sort_order);

drop trigger if exists production_work_type_size_filling_mappings_set_updated_at
  on public.production_work_type_size_filling_mappings;
create trigger production_work_type_size_filling_mappings_set_updated_at
  before update on public.production_work_type_size_filling_mappings
  for each row execute function public.set_updated_at();

alter table public.production_work_type_size_filling_mappings enable row level security;

drop policy if exists production_work_type_size_filling_mappings_read
  on public.production_work_type_size_filling_mappings;
create policy production_work_type_size_filling_mappings_read
  on public.production_work_type_size_filling_mappings
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists production_work_type_size_filling_mappings_manage
  on public.production_work_type_size_filling_mappings;
create policy production_work_type_size_filling_mappings_manage
  on public.production_work_type_size_filling_mappings
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );
