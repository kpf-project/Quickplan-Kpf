create table if not exists public.production_snack_yield_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  employee_code text not null,
  employee_name_snapshot text,
  employee_department_snapshot text,
  employee_branch_snapshot text,
  employee_check_in_snapshot text,
  employee_check_out_snapshot text,
  product_code_snapshot text not null,
  product_name_snapshot text not null,
  product_icdept_code_snapshot text not null,
  product_icdept_name_snapshot text,
  product_unit_snapshot text,
  good_kg_input numeric(14, 4) not null check (good_kg_input >= 0),
  waste_kg_input numeric(14, 4) not null check (waste_kg_input >= 0),
  remain_kg_input numeric(14, 4) not null check (remain_kg_input >= 0),
  net_kg_snapshot numeric(14, 4) not null check (net_kg_snapshot >= 0),
  tin_weight_kg_snapshot numeric(14, 4) not null default 0.4 check (tin_weight_kg_snapshot > 0),
  tins_per_case_snapshot integer not null default 12 check (tins_per_case_snapshot > 0),
  kg_per_case_snapshot numeric(14, 4) not null default 4.8 check (kg_per_case_snapshot > 0),
  net_cases_exact_snapshot numeric(16, 6) not null default 0 check (net_cases_exact_snapshot >= 0),
  net_cases_floor_snapshot integer not null default 0 check (net_cases_floor_snapshot >= 0),
  net_cases_remainder_kg_snapshot numeric(14, 4) not null default 0 check (net_cases_remainder_kg_snapshot >= 0),
  notes text,
  source text not null default 'snack_yield_scan'
    check (source in ('snack_yield_scan', 'manual', 'import')),
  raw_qr_payload text,
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_username_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  machine_code text not null,
  doc_year_be integer not null,
  doc_round integer not null,
  doc_seq integer not null,
  doc_no text not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  is_edited boolean not null default false,
  edited_at timestamptz,
  edited_by uuid references auth.users(id) on delete set null,
  edit_reason text,
  doc_status text not null default 'active' check (doc_status in ('active', 'replaced', 'cancelled')),
  revised_from_log_id uuid references public.production_snack_yield_logs(id) on delete set null,
  revised_from_doc_no text,
  replaced_by_log_id uuid references public.production_snack_yield_logs(id) on delete set null,
  replaced_by_doc_no text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancel_reason text,
  constraint production_snack_yield_logs_machine_code_check
    check (machine_code ~ '^[A-Z0-9]{2,8}$'),
  constraint production_snack_yield_logs_doc_year_be_check
    check (doc_year_be between 2500 and 2700),
  constraint production_snack_yield_logs_doc_round_check
    check (doc_round >= 1),
  constraint production_snack_yield_logs_doc_seq_check
    check (doc_seq between 1 and 100000),
  constraint production_snack_yield_logs_doc_no_check
    check (doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'),
  constraint production_snack_yield_logs_revised_from_not_self_check
    check (revised_from_log_id is null or revised_from_log_id <> id),
  constraint production_snack_yield_logs_replaced_by_not_self_check
    check (replaced_by_log_id is null or replaced_by_log_id <> id)
);

create unique index if not exists production_snack_yield_logs_doc_no_unique_idx
  on public.production_snack_yield_logs (doc_no);

create unique index if not exists production_snack_yield_logs_machine_year_round_seq_unique_idx
  on public.production_snack_yield_logs (machine_code, doc_year_be, doc_round, doc_seq)
  where doc_status <> 'cancelled';

create index if not exists production_snack_yield_logs_logged_at_idx
  on public.production_snack_yield_logs (logged_at desc);

create index if not exists production_snack_yield_logs_doc_status_logged_at_idx
  on public.production_snack_yield_logs (doc_status, logged_at desc);

create index if not exists production_snack_yield_logs_employee_idx
  on public.production_snack_yield_logs (employee_code, logged_at desc);

create index if not exists production_snack_yield_logs_product_idx
  on public.production_snack_yield_logs (product_code_snapshot, logged_at desc);

create index if not exists production_snack_yield_logs_operator_idx
  on public.production_snack_yield_logs (operator_user_id, logged_at desc);

create index if not exists production_snack_yield_logs_revised_from_log_id_idx
  on public.production_snack_yield_logs (revised_from_log_id);

create index if not exists production_snack_yield_logs_replaced_by_log_id_idx
  on public.production_snack_yield_logs (replaced_by_log_id);

create index if not exists production_snack_yield_logs_cancelled_by_idx
  on public.production_snack_yield_logs (cancelled_by, cancelled_at desc);

create table if not exists public.production_snack_yield_log_revisions (
  id bigserial primary key,
  log_id uuid not null references public.production_snack_yield_logs(id) on delete cascade,
  action text not null check (action in ('update', 'replace', 'cancel')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  edited_by uuid references auth.users(id) on delete set null,
  edit_reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists production_snack_yield_log_revisions_log_idx
  on public.production_snack_yield_log_revisions (log_id, created_at desc);

create index if not exists production_snack_yield_log_revisions_actor_idx
  on public.production_snack_yield_log_revisions (edited_by, created_at desc);

alter table public.production_snack_yield_logs enable row level security;
alter table public.production_snack_yield_log_revisions enable row level security;

drop policy if exists production_snack_yield_logs_read on public.production_snack_yield_logs;
create policy production_snack_yield_logs_read
  on public.production_snack_yield_logs
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_snack_yield_logs_insert on public.production_snack_yield_logs;
create policy production_snack_yield_logs_insert
  on public.production_snack_yield_logs
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_snack_yield_logs_update_manage on public.production_snack_yield_logs;
create policy production_snack_yield_logs_update_manage
  on public.production_snack_yield_logs
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

drop policy if exists production_snack_yield_logs_delete_admin_only on public.production_snack_yield_logs;
create policy production_snack_yield_logs_delete_admin_only
  on public.production_snack_yield_logs
  for delete
  using (public.is_admin());

drop policy if exists production_snack_yield_log_revisions_read on public.production_snack_yield_log_revisions;
create policy production_snack_yield_log_revisions_read
  on public.production_snack_yield_log_revisions
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_snack_yield_log_revisions_insert on public.production_snack_yield_log_revisions;
create policy production_snack_yield_log_revisions_insert
  on public.production_snack_yield_log_revisions
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_snack_yield_log_revisions_update_admin_only on public.production_snack_yield_log_revisions;
create policy production_snack_yield_log_revisions_update_admin_only
  on public.production_snack_yield_log_revisions
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists production_snack_yield_log_revisions_delete_admin_only on public.production_snack_yield_log_revisions;
create policy production_snack_yield_log_revisions_delete_admin_only
  on public.production_snack_yield_log_revisions
  for delete
  using (public.is_admin());
