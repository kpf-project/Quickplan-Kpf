alter table public.production_material_claims_daily
  add column if not exists demand_source text not null default 'subplan_raw';

alter table public.production_material_claims_weekly
  add column if not exists demand_source text not null default 'subplan_raw';

alter table public.production_material_claim_events
  add column if not exists demand_source text null;

update public.production_material_claim_events
set demand_source = 'subplan_raw'
where demand_source is null;

alter table public.production_material_claims_daily
  drop constraint if exists production_material_claims_daily_demand_source_check;

alter table public.production_material_claims_daily
  add constraint production_material_claims_daily_demand_source_check
  check (demand_source in ('fg_direct', 'subplan_raw'));

alter table public.production_material_claims_weekly
  drop constraint if exists production_material_claims_weekly_demand_source_check;

alter table public.production_material_claims_weekly
  add constraint production_material_claims_weekly_demand_source_check
  check (demand_source in ('fg_direct', 'subplan_raw'));

alter table public.production_material_claim_events
  drop constraint if exists production_material_claim_events_demand_source_check;

alter table public.production_material_claim_events
  add constraint production_material_claim_events_demand_source_check
  check (demand_source in ('fg_direct', 'subplan_raw'));

alter table public.production_material_claims_daily
  drop constraint if exists production_material_claims_daily_unique;

alter table public.production_material_claims_daily
  add constraint production_material_claims_daily_unique
  unique (master_plan_no, material_sku_code, material_goods_code, work_date, owner_department_id, demand_source);

alter table public.production_material_claims_weekly
  drop constraint if exists production_material_claims_weekly_unique;

alter table public.production_material_claims_weekly
  add constraint production_material_claims_weekly_unique
  unique (master_plan_no, material_sku_code, material_goods_code, week_start_date, owner_department_id, demand_source);

create index if not exists production_material_claims_daily_demand_source_idx
  on public.production_material_claims_daily (demand_source, owner_department_id, department_id, status, work_date);

create index if not exists production_material_claims_weekly_demand_source_idx
  on public.production_material_claims_weekly (demand_source, owner_department_id, department_id, status, week_start_date);

create index if not exists production_material_claim_events_demand_source_idx
  on public.production_material_claim_events (demand_source, owner_department_id, bucket_date, created_at desc);
