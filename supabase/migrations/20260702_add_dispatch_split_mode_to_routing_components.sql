alter table public.production_routing_components
  add column if not exists dispatch_split_mode text;

update public.production_routing_components
set dispatch_split_mode = coalesce(dispatch_split_mode, 'merge_all')
where dispatch_split_mode is null;

alter table public.production_routing_components
  alter column dispatch_split_mode set default 'merge_all';

alter table public.production_routing_components
  alter column dispatch_split_mode set not null;

alter table public.production_routing_components
  drop constraint if exists production_routing_components_dispatch_split_mode_check;

alter table public.production_routing_components
  add constraint production_routing_components_dispatch_split_mode_check
  check (dispatch_split_mode in ('merge_all', 'split_by_material_type'));
