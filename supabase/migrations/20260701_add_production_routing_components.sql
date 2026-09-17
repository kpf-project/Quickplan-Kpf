create table if not exists public.production_routing_components (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.production_departments(id) on delete restrict,
  fg_sku_code text not null,
  fg_sku_name text not null,
  component_sku_code text not null,
  component_sku_name text not null,
  component_type text not null,
  work_center_id uuid not null references public.production_work_centers(id) on delete restrict,
  remark text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  constraint production_routing_components_fg_not_blank check (length(trim(fg_sku_code)) > 0),
  constraint production_routing_components_component_not_blank check (length(trim(component_sku_code)) > 0),
  constraint production_routing_components_type_check check (component_type in ('WIP', 'RAW', 'PACK'))
);

create unique index if not exists production_routing_components_unique_active
  on public.production_routing_components (department_id, fg_sku_code, component_sku_code)
  where deleted_at is null;

create index if not exists production_routing_components_filter_idx
  on public.production_routing_components (department_id, fg_sku_code, is_active);

drop trigger if exists production_routing_components_set_updated_at
  on public.production_routing_components;
create trigger production_routing_components_set_updated_at
  before update on public.production_routing_components
  for each row execute function public.set_updated_at();

alter table public.production_routing_components enable row level security;

drop policy if exists production_routing_components_read on public.production_routing_components;
create policy production_routing_components_read
  on public.production_routing_components
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_routing_components_manage on public.production_routing_components;
create policy production_routing_components_manage
  on public.production_routing_components
  for all
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));
