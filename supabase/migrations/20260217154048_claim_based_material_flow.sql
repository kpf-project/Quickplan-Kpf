begin;

insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('plan.claim_material', 'Plan Claim Material', '/production-line/planning/claims?ability=plan.claim_material', 'production-line', now()),
  ('plan.release_claim', 'Plan Release Claim', '/production-line/planning/claims?ability=plan.release_claim', 'production-line', now()),
  ('plan.reassign_claim', 'Plan Reassign Claim', '/production-line/planning/claims?ability=plan.reassign_claim', 'production-line', now()),
  ('plan.view_claim_all', 'Plan View Claim All', '/production-line/planning/claims?ability=plan.view_claim_all', 'production-line', now())
on conflict (perm_key) do update
set
  label = excluded.label,
  path = excluded.path,
  group_key = excluded.group_key,
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.perm_key in (
    'plan.claim_material',
    'plan.release_claim',
    'plan.reassign_claim',
    'plan.view_claim_all'
  )
where r.role_key = 'admin'
on conflict do nothing;

create table if not exists public.production_material_claims_daily (
  id bigserial primary key,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  material_sku_code text not null references public.products_cache(sku_code) on delete restrict,
  work_date date not null,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  status text not null default 'claimed',
  source text not null default 'manual_claim',
  note text,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz not null default now(),
  released_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_material_claims_daily_status_check
    check (status in ('claimed', 'released')),
  constraint production_material_claims_daily_source_check
    check (source in ('manual_claim', 'auto_claim', 'fallback')),
  constraint production_material_claims_daily_unique
    unique (master_plan_no, material_sku_code, work_date)
);

create index if not exists production_material_claims_daily_dept_idx
  on public.production_material_claims_daily (department_id, status, work_date, material_sku_code);

create index if not exists production_material_claims_daily_plan_idx
  on public.production_material_claims_daily (master_plan_no, work_date, status);

create table if not exists public.production_material_claims_weekly (
  id bigserial primary key,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  material_sku_code text not null references public.products_cache(sku_code) on delete restrict,
  week_start_date date not null,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  status text not null default 'claimed',
  source text not null default 'manual_claim',
  note text,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz not null default now(),
  released_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_material_claims_weekly_status_check
    check (status in ('claimed', 'released')),
  constraint production_material_claims_weekly_source_check
    check (source in ('manual_claim', 'auto_claim', 'fallback')),
  constraint production_material_claims_weekly_unique
    unique (master_plan_no, material_sku_code, week_start_date)
);

create index if not exists production_material_claims_weekly_dept_idx
  on public.production_material_claims_weekly (department_id, status, week_start_date, material_sku_code);

create index if not exists production_material_claims_weekly_plan_idx
  on public.production_material_claims_weekly (master_plan_no, week_start_date, status);

create table if not exists public.production_material_claim_events (
  id bigserial primary key,
  claim_grain text not null,
  action text not null,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  material_sku_code text not null references public.products_cache(sku_code) on delete restrict,
  bucket_date date not null,
  from_department_id uuid references public.production_departments(id) on delete set null,
  to_department_id uuid references public.production_departments(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_material_claim_events_grain_check
    check (claim_grain in ('daily', 'weekly')),
  constraint production_material_claim_events_action_check
    check (action in ('claim', 'release', 'reassign', 'auto_assign'))
);

create index if not exists production_material_claim_events_plan_idx
  on public.production_material_claim_events (master_plan_no, bucket_date, created_at desc);

create index if not exists production_material_claim_events_material_idx
  on public.production_material_claim_events (material_sku_code, bucket_date, created_at desc);

create table if not exists public.production_department_delegations (
  id bigserial primary key,
  delegator_user_id uuid not null references public.profiles(id) on delete cascade,
  delegate_user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.production_departments(id) on delete cascade,
  permissions text[] not null default '{}'::text[],
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_department_delegations_validity_check
    check (valid_to > valid_from)
);

create index if not exists production_department_delegations_delegate_idx
  on public.production_department_delegations (delegate_user_id, department_id, is_active, valid_from, valid_to);

create index if not exists production_department_delegations_delegator_idx
  on public.production_department_delegations (delegator_user_id, is_active, valid_from, valid_to);

drop trigger if exists production_material_claims_daily_set_updated_at on public.production_material_claims_daily;
create trigger production_material_claims_daily_set_updated_at
  before update on public.production_material_claims_daily
  for each row execute function public.set_updated_at();

drop trigger if exists production_material_claims_weekly_set_updated_at on public.production_material_claims_weekly;
create trigger production_material_claims_weekly_set_updated_at
  before update on public.production_material_claims_weekly
  for each row execute function public.set_updated_at();

drop trigger if exists production_department_delegations_set_updated_at on public.production_department_delegations;
create trigger production_department_delegations_set_updated_at
  before update on public.production_department_delegations
  for each row execute function public.set_updated_at();

create or replace function public.can_act_on_claim_department(
  p_department_id uuid,
  p_required_permission text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return false;
  end if;

  if public.is_admin() or public.has_permission('production-line-planning-manage') then
    return true;
  end if;

  if exists (
    select 1
    from public.production_department_users pdu
    join public.production_departments pd
      on pd.id = pdu.department_id
    where pdu.user_id = v_uid
      and pdu.department_id = p_department_id
      and pdu.role = 'editor'
      and pd.is_active = true
      and pd.deleted_at is null
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.production_department_delegations d
    where d.delegate_user_id = v_uid
      and d.department_id = p_department_id
      and d.is_active = true
      and now() >= d.valid_from
      and now() <= d.valid_to
      and (
        p_required_permission is null
        or p_required_permission = any(d.permissions)
      )
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_act_on_claim_department(uuid, text) from public;
grant execute on function public.can_act_on_claim_department(uuid, text) to authenticated;
grant execute on function public.can_act_on_claim_department(uuid, text) to service_role;

alter table public.production_material_claims_daily enable row level security;
alter table public.production_material_claims_weekly enable row level security;
alter table public.production_material_claim_events enable row level security;
alter table public.production_department_delegations enable row level security;

drop policy if exists production_material_claims_daily_read on public.production_material_claims_daily;
create policy production_material_claims_daily_read
  on public.production_material_claims_daily
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.view_claim_all')
    or public.can_act_on_claim_department(department_id, null)
  );

drop policy if exists production_material_claims_daily_write on public.production_material_claims_daily;
create policy production_material_claims_daily_write
  on public.production_material_claims_daily
  for all
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

drop policy if exists production_material_claims_weekly_read on public.production_material_claims_weekly;
create policy production_material_claims_weekly_read
  on public.production_material_claims_weekly
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.view_claim_all')
    or public.can_act_on_claim_department(department_id, null)
  );

drop policy if exists production_material_claims_weekly_write on public.production_material_claims_weekly;
create policy production_material_claims_weekly_write
  on public.production_material_claims_weekly
  for all
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

drop policy if exists production_material_claim_events_read on public.production_material_claim_events;
create policy production_material_claim_events_read
  on public.production_material_claim_events
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.view_claim_all')
  );

drop policy if exists production_material_claim_events_insert on public.production_material_claim_events;
create policy production_material_claim_events_insert
  on public.production_material_claim_events
  for insert
  to authenticated
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.claim_material')
    or public.has_permission('plan.release_claim')
    or public.has_permission('plan.reassign_claim')
  );

drop policy if exists production_department_delegations_read on public.production_department_delegations;
create policy production_department_delegations_read
  on public.production_department_delegations
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or delegator_user_id = (select auth.uid())
    or delegate_user_id = (select auth.uid())
  );

drop policy if exists production_department_delegations_write on public.production_department_delegations;
create policy production_department_delegations_write
  on public.production_department_delegations
  for all
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or delegator_user_id = (select auth.uid())
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or delegator_user_id = (select auth.uid())
  );

comment on table public.production_material_claims_daily
is 'Claim owner รายวัน: แผนกที่รับผิดชอบวัตถุดิบตามรอบแผน ณ วันใช้งาน';

comment on table public.production_material_claims_weekly
is 'Claim owner รายสัปดาห์: แผนกที่รับผิดชอบวัตถุดิบตามรอบแผน ณ สัปดาห์ใช้งาน';

comment on table public.production_material_claim_events
is 'Audit trail ของการ claim/release/reassign วัตถุดิบในรอบแผน';

comment on table public.production_department_delegations
is 'มอบหมายสิทธิ์ชั่วคราวของแต่ละแผนกสำหรับ claim workflow';

commit;
