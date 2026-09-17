insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  (
    'production-line-attendance-report-view',
    'Production Line Attendance Report (View)',
    '/production-line/attendance/report',
    'production-line',
    now()
  ),
  (
    'production-line-attendance-report-manage',
    'Production Line Attendance Report (Manage)',
    '/production-line/attendance/report/manage',
    'production-line',
    now()
  )
on conflict (perm_key) do update
set
  label = excluded.label,
  path = excluded.path,
  group_key = excluded.group_key;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.perm_key in (
    'production-line-attendance-report-view',
    'production-line-attendance-report-manage'
  )
where r.role_key = 'admin'
on conflict do nothing;

alter table if exists public.production_work_types
  add column if not exists conversion_mode text not null default 'weight_kg',
  add column if not exists default_kg_per_unit numeric(14, 4),
  add column if not exists pay_rate_per_kg numeric(14, 4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_work_types_conversion_mode_check'
  ) then
    alter table public.production_work_types
      add constraint production_work_types_conversion_mode_check
      check (conversion_mode in ('weight_kg', 'unit_count'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_work_types_default_kg_per_unit_check'
  ) then
    alter table public.production_work_types
      add constraint production_work_types_default_kg_per_unit_check
      check (default_kg_per_unit is null or default_kg_per_unit > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_work_types_pay_rate_per_kg_check'
  ) then
    alter table public.production_work_types
      add constraint production_work_types_pay_rate_per_kg_check
      check (pay_rate_per_kg >= 0);
  end if;
end $$;

create table if not exists public.production_work_type_conversion_rules (
  id bigserial primary key,
  work_type_id uuid not null references public.production_work_types(id) on delete cascade,
  size_value text,
  filling_value text,
  kg_per_unit numeric(14, 4) not null check (kg_per_unit > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create unique index if not exists production_work_type_conversion_rules_unique_idx
  on public.production_work_type_conversion_rules (
    work_type_id,
    coalesce(lower(size_value), ''),
    coalesce(lower(filling_value), '')
  )
  where deleted_at is null;

create index if not exists production_work_type_conversion_rules_work_type_idx
  on public.production_work_type_conversion_rules (work_type_id, sort_order);

drop trigger if exists production_work_type_conversion_rules_set_updated_at
  on public.production_work_type_conversion_rules;
create trigger production_work_type_conversion_rules_set_updated_at
  before update on public.production_work_type_conversion_rules
  for each row execute function public.set_updated_at();

alter table public.production_work_type_conversion_rules enable row level security;

drop policy if exists production_work_type_conversion_rules_read on public.production_work_type_conversion_rules;
create policy production_work_type_conversion_rules_read
  on public.production_work_type_conversion_rules
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_work_type_conversion_rules_manage on public.production_work_type_conversion_rules;
create policy production_work_type_conversion_rules_manage
  on public.production_work_type_conversion_rules
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

alter table if exists public.production_daily_work_logs
  add column if not exists conversion_mode_snapshot text not null default 'weight_kg',
  add column if not exists conversion_kg_per_unit_snapshot numeric(14, 4),
  add column if not exists normalized_kg_amount_snapshot numeric(14, 4) not null default 0,
  add column if not exists pay_rate_per_kg_snapshot numeric(14, 4) not null default 0,
  add column if not exists wage_amount_snapshot numeric(14, 4) not null default 0,
  add column if not exists is_edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null,
  add column if not exists edit_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_conversion_mode_snapshot_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_conversion_mode_snapshot_check
      check (conversion_mode_snapshot in ('weight_kg', 'unit_count'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_conversion_kg_per_unit_snapshot_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_conversion_kg_per_unit_snapshot_check
      check (
        conversion_kg_per_unit_snapshot is null
        or conversion_kg_per_unit_snapshot > 0
      );
  end if;
end $$;

create index if not exists production_daily_work_logs_edit_idx
  on public.production_daily_work_logs (logged_at desc, is_edited);

create table if not exists public.production_daily_work_log_revisions (
  id bigserial primary key,
  log_id uuid not null references public.production_daily_work_logs(id) on delete cascade,
  action text not null check (action in ('update')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  edited_by uuid references auth.users(id) on delete set null,
  edit_reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists production_daily_work_log_revisions_log_idx
  on public.production_daily_work_log_revisions (log_id, created_at desc);

create index if not exists production_daily_work_log_revisions_actor_idx
  on public.production_daily_work_log_revisions (edited_by, created_at desc);

alter table public.production_daily_work_log_revisions enable row level security;

drop policy if exists production_daily_work_log_revisions_read on public.production_daily_work_log_revisions;
create policy production_daily_work_log_revisions_read
  on public.production_daily_work_log_revisions
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_daily_work_log_revisions_insert on public.production_daily_work_log_revisions;
create policy production_daily_work_log_revisions_insert
  on public.production_daily_work_log_revisions
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_daily_work_log_revisions_update_admin_only on public.production_daily_work_log_revisions;
create policy production_daily_work_log_revisions_update_admin_only
  on public.production_daily_work_log_revisions
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists production_daily_work_log_revisions_delete_admin_only on public.production_daily_work_log_revisions;
create policy production_daily_work_log_revisions_delete_admin_only
  on public.production_daily_work_log_revisions
  for delete
  using (public.is_admin());

drop policy if exists production_daily_work_logs_read on public.production_daily_work_logs;
create policy production_daily_work_logs_read
  on public.production_daily_work_logs
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_daily_work_logs_update_admin_only on public.production_daily_work_logs;
drop policy if exists production_daily_work_logs_update_manage on public.production_daily_work_logs;
create policy production_daily_work_logs_update_manage
  on public.production_daily_work_logs
  for update
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

