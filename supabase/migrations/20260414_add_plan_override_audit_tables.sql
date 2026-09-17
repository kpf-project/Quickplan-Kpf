begin;

create table if not exists public.production_plan_material_overrides (
  plan_id text not null,
  material_sku_code text not null,
  material_name text,
  mode text not null,
  required_qty numeric not null default 0,
  issue_qty numeric not null default 0,
  base_required_qty numeric not null default 0,
  base_issue_qty numeric not null default 0,
  reason text not null,
  edited_at timestamptz not null default now(),
  edited_by text,
  edited_by_user_id uuid,
  source text not null default 'planning_modal',
  snapshot_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_plan_material_overrides_pkey primary key (plan_id, material_sku_code),
  constraint production_plan_material_overrides_plan_fk
    foreign key (plan_id) references public.production_plan_status(plan_id) on delete cascade,
  constraint production_plan_material_overrides_mode_check
    check (mode in ('formula', 'custom', 'skip')),
  constraint production_plan_material_overrides_required_qty_check
    check (required_qty >= 0),
  constraint production_plan_material_overrides_issue_qty_check
    check (issue_qty >= 0),
  constraint production_plan_material_overrides_base_required_qty_check
    check (base_required_qty >= 0),
  constraint production_plan_material_overrides_base_issue_qty_check
    check (base_issue_qty >= 0),
  constraint production_plan_material_overrides_reason_check
    check (length(trim(reason)) > 0),
  constraint production_plan_material_overrides_edited_by_user_fk
    foreign key (edited_by_user_id) references auth.users(id) on delete set null
);

create index if not exists production_plan_material_overrides_mode_idx
  on public.production_plan_material_overrides (mode);

create index if not exists production_plan_material_overrides_edited_at_idx
  on public.production_plan_material_overrides (edited_at desc);

create index if not exists production_plan_material_overrides_plan_edited_idx
  on public.production_plan_material_overrides (plan_id, edited_at desc);

create index if not exists production_plan_material_overrides_edited_at_brin
  on public.production_plan_material_overrides using brin (edited_at);

drop trigger if exists production_plan_material_overrides_set_updated_at
  on public.production_plan_material_overrides;
create trigger production_plan_material_overrides_set_updated_at
  before update on public.production_plan_material_overrides
  for each row execute procedure public.set_updated_at();

create table if not exists public.production_plan_events (
  id bigserial primary key,
  plan_id text not null,
  event_type text not null,
  actor_id uuid,
  actor_name text,
  source text not null default 'planning',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_plan_events_actor_fk
    foreign key (actor_id) references auth.users(id) on delete set null,
  constraint production_plan_events_plan_fk
    foreign key (plan_id) references public.production_plan_status(plan_id) on delete cascade,
  constraint production_plan_events_event_type_check
    check (length(trim(event_type)) > 0)
);

create index if not exists production_plan_events_plan_created_idx
  on public.production_plan_events (plan_id, created_at desc);

create index if not exists production_plan_events_created_at_brin
  on public.production_plan_events using brin (created_at);

alter table public.production_plan_material_overrides enable row level security;
alter table public.production_plan_events enable row level security;

drop policy if exists production_plan_material_overrides_select_authenticated on public.production_plan_material_overrides;
create policy production_plan_material_overrides_select_authenticated
  on public.production_plan_material_overrides
  for select
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-view')
    or has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_material_overrides_insert_authenticated on public.production_plan_material_overrides;
create policy production_plan_material_overrides_insert_authenticated
  on public.production_plan_material_overrides
  for insert
  to authenticated
  with check (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_material_overrides_update_authenticated on public.production_plan_material_overrides;
create policy production_plan_material_overrides_update_authenticated
  on public.production_plan_material_overrides
  for update
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-manage')
  )
  with check (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_material_overrides_delete_authenticated on public.production_plan_material_overrides;
create policy production_plan_material_overrides_delete_authenticated
  on public.production_plan_material_overrides
  for delete
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_events_select_authenticated on public.production_plan_events;
create policy production_plan_events_select_authenticated
  on public.production_plan_events
  for select
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-view')
    or has_permission('production-line-planning-manage')
  );

drop policy if exists production_plan_events_insert_authenticated on public.production_plan_events;
create policy production_plan_events_insert_authenticated
  on public.production_plan_events
  for insert
  to authenticated
  with check (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

with extracted as (
  select
    p.plan_id,
    upper(trim(coalesce(mat->>'skuCode', ''))) as material_sku_code,
    nullif(trim(coalesce(mat->>'name', mat->>'skuName', '')), '') as material_name,
    lower(trim(coalesce(mat->'override'->>'mode', 'formula'))) as mode,
    coalesce((nullif(mat->>'requiredQty', ''))::numeric, 0) as required_qty,
    coalesce((nullif(mat->>'issueQty', ''))::numeric, 0) as issue_qty,
    coalesce((nullif(mat->'override'->>'baseRequiredQty', ''))::numeric, coalesce((nullif(mat->>'requiredQty', ''))::numeric, 0)) as base_required_qty,
    coalesce((nullif(mat->'override'->>'baseIssueQty', ''))::numeric, coalesce((nullif(mat->>'issueQty', ''))::numeric, 0)) as base_issue_qty,
    nullif(trim(coalesce(mat->'override'->>'reason', '')), '') as reason,
    coalesce((nullif(mat->'override'->>'editedAt', ''))::timestamptz, now()) as edited_at,
    nullif(trim(coalesce(mat->'override'->>'editedBy', '')), '') as edited_by,
    coalesce((nullif((p.bom_snapshot->0->>'generatedAt'), ''))::timestamptz, now()) as snapshot_generated_at
  from public.production_plan_status p
  cross join lateral jsonb_array_elements(
    coalesce(p.bom_snapshot->0->'materials', '[]'::jsonb)
  ) as mat
  where p.status = 'ready'
), cleaned as (
  select *
  from extracted
  where material_sku_code <> ''
    and mode in ('custom', 'skip')
    and reason is not null
)
insert into public.production_plan_material_overrides (
  plan_id,
  material_sku_code,
  material_name,
  mode,
  required_qty,
  issue_qty,
  base_required_qty,
  base_issue_qty,
  reason,
  edited_at,
  edited_by,
  source,
  snapshot_generated_at
)
select
  plan_id,
  material_sku_code,
  material_name,
  mode,
  greatest(required_qty, 0),
  greatest(issue_qty, 0),
  greatest(base_required_qty, 0),
  greatest(base_issue_qty, 0),
  reason,
  edited_at,
  edited_by,
  'snapshot_backfill'::text,
  snapshot_generated_at
from cleaned
on conflict (plan_id, material_sku_code) do update
set
  material_name = excluded.material_name,
  mode = excluded.mode,
  required_qty = excluded.required_qty,
  issue_qty = excluded.issue_qty,
  base_required_qty = excluded.base_required_qty,
  base_issue_qty = excluded.base_issue_qty,
  reason = excluded.reason,
  edited_at = excluded.edited_at,
  edited_by = excluded.edited_by,
  source = excluded.source,
  snapshot_generated_at = excluded.snapshot_generated_at;

insert into public.production_plan_events (
  plan_id,
  event_type,
  actor_name,
  source,
  payload,
  created_at
)
select
  plan_id,
  'plan_overrides_backfilled',
  'system',
  'snapshot_backfill',
  jsonb_build_object('overridesCount', count(*)::int),
  now()
from public.production_plan_material_overrides
where source = 'snapshot_backfill'
group by plan_id
on conflict do nothing;

commit;
