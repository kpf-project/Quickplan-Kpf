begin;

alter table public.production_wip_policies
  add column if not exists requires_requisition boolean not null default false;

create index if not exists production_wip_policies_requisition_idx
  on public.production_wip_policies (requires_requisition, is_active);

commit;
