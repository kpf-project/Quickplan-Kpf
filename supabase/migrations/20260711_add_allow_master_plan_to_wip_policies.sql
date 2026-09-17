begin;

alter table public.production_wip_policies
  add column if not exists allow_master_plan boolean not null default false;

create index if not exists production_wip_policies_master_plan_idx
  on public.production_wip_policies (allow_master_plan, is_active);

commit;
