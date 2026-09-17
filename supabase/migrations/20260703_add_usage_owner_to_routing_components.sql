alter table public.production_routing_components
  add column if not exists usage_type text;

update public.production_routing_components
set usage_type = coalesce(usage_type, 'DIRECT')
where usage_type is null;

alter table public.production_routing_components
  alter column usage_type set default 'DIRECT';

alter table public.production_routing_components
  alter column usage_type set not null;

alter table public.production_routing_components
  drop constraint if exists production_routing_components_usage_type_check;

alter table public.production_routing_components
  add constraint production_routing_components_usage_type_check
  check (usage_type in ('DIRECT', 'PROCESS'));

alter table public.production_routing_components
  add column if not exists issue_owner_department_id uuid references public.production_departments(id) on delete set null;

create index if not exists production_routing_components_issue_owner_idx
  on public.production_routing_components (issue_owner_department_id)
  where deleted_at is null;
