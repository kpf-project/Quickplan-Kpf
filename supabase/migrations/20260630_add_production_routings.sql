create table if not exists public.production_routings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.production_departments(id) on delete restrict,
  sku_code text not null,
  sku_name text not null,
  item_type text not null,
  work_center_id uuid not null references public.production_work_centers(id) on delete restrict,
  remark text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  constraint production_routings_sku_code_not_blank check (length(trim(sku_code)) > 0),
  constraint production_routings_sku_name_not_blank check (length(trim(sku_name)) > 0),
  constraint production_routings_item_type_check check (item_type in ('FG', 'WIP'))
);

create unique index if not exists production_routings_unique_active_map
  on public.production_routings (department_id, sku_code, item_type, work_center_id)
  where deleted_at is null;

create index if not exists production_routings_search_idx
  on public.production_routings (department_id, item_type, is_active, sku_code)
  where deleted_at is null;

drop trigger if exists production_routings_set_updated_at
  on public.production_routings;
create trigger production_routings_set_updated_at
  before update on public.production_routings
  for each row execute function public.set_updated_at();

alter table public.production_routings enable row level security;

drop policy if exists production_routings_read on public.production_routings;
create policy production_routings_read
  on public.production_routings
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_routings_manage on public.production_routings;
create policy production_routings_manage
  on public.production_routings
  for all
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));
