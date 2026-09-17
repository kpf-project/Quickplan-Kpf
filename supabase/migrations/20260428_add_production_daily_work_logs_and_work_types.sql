create table if not exists public.production_work_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  default_value_label text not null default 'ปริมาณงาน',
  default_unit_label text not null default 'หน่วย',
  default_value_kind text not null default 'decimal'
    check (default_value_kind in ('decimal', 'integer')),
  default_decimal_scale smallint not null default 2
    check (default_decimal_scale between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create unique index if not exists production_work_types_code_unique
  on public.production_work_types (lower(code))
  where deleted_at is null;

create unique index if not exists production_work_types_name_unique
  on public.production_work_types (lower(name))
  where deleted_at is null;

create table if not exists public.production_work_type_units (
  id bigserial primary key,
  work_type_id uuid not null references public.production_work_types(id) on delete cascade,
  department_id uuid not null references public.production_departments(id) on delete cascade,
  value_label text not null default 'ปริมาณงาน',
  unit_label text not null,
  value_kind text not null default 'decimal'
    check (value_kind in ('decimal', 'integer')),
  decimal_scale smallint not null default 2
    check (decimal_scale between 0 and 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint production_work_type_units_unit_label_check
    check (length(trim(unit_label)) > 0)
);

create unique index if not exists production_work_type_units_unique_idx
  on public.production_work_type_units (work_type_id, department_id);

create index if not exists production_work_type_units_department_idx
  on public.production_work_type_units (department_id);

create index if not exists production_work_type_units_work_type_idx
  on public.production_work_type_units (work_type_id);

create table if not exists public.production_daily_work_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  employee_code text not null,
  employee_name_snapshot text,
  employee_department_snapshot text,
  employee_branch_snapshot text,
  employee_check_in_snapshot text,
  employee_check_out_snapshot text,
  work_type_id uuid not null references public.production_work_types(id) on delete restrict,
  work_type_code_snapshot text not null,
  work_type_name_snapshot text not null,
  department_id uuid references public.production_departments(id) on delete set null,
  department_code_snapshot text,
  department_name_snapshot text,
  value_amount numeric(14, 4) not null
    check (value_amount >= 0),
  value_label_snapshot text not null,
  unit_label_snapshot text not null,
  value_kind_snapshot text not null
    check (value_kind_snapshot in ('decimal', 'integer')),
  decimal_scale_snapshot smallint not null default 2
    check (decimal_scale_snapshot between 0 and 6),
  description text,
  source text not null default 'daily_scan'
    check (source in ('daily_scan', 'manual', 'import')),
  raw_qr_payload text,
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_username_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists production_daily_work_logs_logged_at_idx
  on public.production_daily_work_logs (logged_at desc);

create index if not exists production_daily_work_logs_employee_idx
  on public.production_daily_work_logs (employee_code, logged_at desc);

create index if not exists production_daily_work_logs_work_type_idx
  on public.production_daily_work_logs (work_type_id, logged_at desc);

create index if not exists production_daily_work_logs_department_idx
  on public.production_daily_work_logs (department_id, logged_at desc);

drop trigger if exists production_work_types_set_updated_at on public.production_work_types;
create trigger production_work_types_set_updated_at
  before update on public.production_work_types
  for each row execute function public.set_updated_at();

drop trigger if exists production_work_type_units_set_updated_at on public.production_work_type_units;
create trigger production_work_type_units_set_updated_at
  before update on public.production_work_type_units
  for each row execute function public.set_updated_at();

alter table public.production_work_types enable row level security;
alter table public.production_work_type_units enable row level security;
alter table public.production_daily_work_logs enable row level security;

drop policy if exists production_work_types_read on public.production_work_types;
create policy production_work_types_read
  on public.production_work_types
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists production_work_types_manage on public.production_work_types;
create policy production_work_types_manage
  on public.production_work_types
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_work_type_units_read on public.production_work_type_units;
create policy production_work_type_units_read
  on public.production_work_type_units
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists production_work_type_units_manage on public.production_work_type_units;
create policy production_work_type_units_manage
  on public.production_work_type_units
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_daily_work_logs_read on public.production_daily_work_logs;
create policy production_daily_work_logs_read
  on public.production_daily_work_logs
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_daily_work_logs_insert on public.production_daily_work_logs;
create policy production_daily_work_logs_insert
  on public.production_daily_work_logs
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists production_daily_work_logs_update_admin_only on public.production_daily_work_logs;
create policy production_daily_work_logs_update_admin_only
  on public.production_daily_work_logs
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists production_daily_work_logs_delete_admin_only on public.production_daily_work_logs;
create policy production_daily_work_logs_delete_admin_only
  on public.production_daily_work_logs
  for delete
  using (public.is_admin());
