alter table public.production_material_claims_daily
  add column if not exists material_goods_code text;

update public.production_material_claims_daily
set material_goods_code = coalesce(nullif(trim(material_goods_code), ''), material_sku_code)
where material_goods_code is null or trim(material_goods_code) = '';

alter table public.production_material_claims_daily
  alter column material_goods_code set not null;

alter table public.production_material_claims_weekly
  add column if not exists material_goods_code text;

update public.production_material_claims_weekly
set material_goods_code = coalesce(nullif(trim(material_goods_code), ''), material_sku_code)
where material_goods_code is null or trim(material_goods_code) = '';

alter table public.production_material_claims_weekly
  alter column material_goods_code set not null;

alter table public.production_material_claim_events
  add column if not exists material_goods_code text;

update public.production_material_claim_events
set material_goods_code = coalesce(nullif(trim(material_goods_code), ''), material_sku_code)
where material_goods_code is null or trim(material_goods_code) = '';

alter table public.production_material_claim_events
  alter column material_goods_code set not null;

alter table public.production_material_claims_daily
  drop constraint if exists production_material_claims_daily_unique;

alter table public.production_material_claims_daily
  add constraint production_material_claims_daily_unique
    unique (master_plan_no, material_sku_code, material_goods_code, work_date);

alter table public.production_material_claims_weekly
  drop constraint if exists production_material_claims_weekly_unique;

alter table public.production_material_claims_weekly
  add constraint production_material_claims_weekly_unique
    unique (master_plan_no, material_sku_code, material_goods_code, week_start_date);

create index if not exists production_material_claims_daily_goods_idx
  on public.production_material_claims_daily (department_id, status, work_date, material_goods_code);

create index if not exists production_material_claims_weekly_goods_idx
  on public.production_material_claims_weekly (department_id, status, week_start_date, material_goods_code);

create index if not exists production_material_claim_events_goods_idx
  on public.production_material_claim_events (material_goods_code, bucket_date, created_at desc);
