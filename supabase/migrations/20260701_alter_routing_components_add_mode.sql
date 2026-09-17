alter table public.production_routing_components
  add column if not exists node_key text,
  add column if not exists parent_sku_code text,
  add column if not exists room_mode text not null default 'explicit';

update public.production_routing_components
set
  node_key = coalesce(node_key, component_sku_code),
  parent_sku_code = coalesce(parent_sku_code, fg_sku_code),
  room_mode = case when room_mode in ('inherit_parent', 'explicit') then room_mode else 'explicit' end
where true;

alter table public.production_routing_components
  alter column node_key set not null,
  alter column parent_sku_code set not null;

alter table public.production_routing_components
  alter column work_center_id drop not null;

alter table public.production_routing_components
  drop constraint if exists production_routing_components_type_check;

alter table public.production_routing_components
  add constraint production_routing_components_type_check
  check (component_type in ('WIP', 'RAW', 'PACK'));

alter table public.production_routing_components
  drop constraint if exists production_routing_components_room_mode_check;

alter table public.production_routing_components
  add constraint production_routing_components_room_mode_check
  check (room_mode in ('inherit_parent', 'explicit'));

drop index if exists production_routing_components_unique_active;
create unique index if not exists production_routing_components_unique_active
  on public.production_routing_components (department_id, fg_sku_code, node_key)
  where deleted_at is null;
