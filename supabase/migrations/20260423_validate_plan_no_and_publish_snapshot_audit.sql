-- 1) Validate Plan No constraints in production_plan_status (now data is backfilled)
-- 2) Add immutable publish snapshot history for full audit trail

alter table if exists public.production_plan_status
  validate constraint production_plan_status_master_plan_no_format_check;

alter table if exists public.production_plan_status
  validate constraint production_plan_status_sub_plan_no_format_check;

create table if not exists public.production_master_plan_snapshots (
  id bigserial primary key,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  published_at timestamptz not null,
  published_by uuid references public.profiles(id) on delete set null,
  published_by_name text,
  snapshot_checksum text not null,
  snapshot_meta jsonb not null default '{}'::jsonb,
  snapshot_bom jsonb not null default '[]'::jsonb,
  snapshot_stock jsonb not null default '[]'::jsonb,
  snapshot_open_po jsonb not null default '[]'::jsonb,
  snapshot_open_mo jsonb not null default '[]'::jsonb,
  snapshot_lead_time jsonb not null default '[]'::jsonb,
  snapshot_material_requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_master_plan_snapshots_checksum_nonempty check (length(trim(snapshot_checksum)) >= 32)
);

create index if not exists production_master_plan_snapshots_master_plan_no_idx
  on public.production_master_plan_snapshots (master_plan_no, published_at desc);

create unique index if not exists production_master_plan_snapshots_unique_publish_idx
  on public.production_master_plan_snapshots (master_plan_no, snapshot_checksum);

alter table public.production_master_plan_snapshots enable row level security;

drop policy if exists production_master_plan_snapshots_read on public.production_master_plan_snapshots;
create policy production_master_plan_snapshots_read
  on public.production_master_plan_snapshots
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
  );

drop policy if exists production_master_plan_snapshots_manage on public.production_master_plan_snapshots;
create policy production_master_plan_snapshots_manage
  on public.production_master_plan_snapshots
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.publish_master')
  );
