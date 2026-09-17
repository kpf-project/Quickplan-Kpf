create table if not exists public.production_delivery_points (
  id uuid primary key default gen_random_uuid(),
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
  constraint production_delivery_points_code_not_blank check (length(trim(code)) > 0),
  constraint production_delivery_points_name_not_blank check (length(trim(name)) > 0),
  constraint production_delivery_points_sort_order_check check (sort_order between 0 and 9999)
);

create unique index if not exists production_delivery_points_code_unique
  on public.production_delivery_points (lower(code))
  where deleted_at is null;

create unique index if not exists production_delivery_points_name_unique
  on public.production_delivery_points (lower(name))
  where deleted_at is null;

create index if not exists production_delivery_points_active_idx
  on public.production_delivery_points (is_active, sort_order, name)
  where deleted_at is null;

drop trigger if exists production_delivery_points_set_updated_at
  on public.production_delivery_points;
create trigger production_delivery_points_set_updated_at
  before update on public.production_delivery_points
  for each row execute function public.set_updated_at();

alter table public.production_delivery_points enable row level security;

drop policy if exists production_delivery_points_read on public.production_delivery_points;
create policy production_delivery_points_read
  on public.production_delivery_points
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_delivery_points_manage on public.production_delivery_points;
create policy production_delivery_points_manage
  on public.production_delivery_points
  for all
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));

alter table public.production_work_centers
  add column if not exists delivery_point_id uuid references public.production_delivery_points(id) on delete set null;

create index if not exists production_work_centers_delivery_point_idx
  on public.production_work_centers (delivery_point_id)
  where deleted_at is null;
