-- Attendance scan event log
-- Stores immutable scan events with employee snapshot data for auditing and reporting

create table if not exists public.attendance_scan_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  employee_code text not null,
  event_type text not null check (event_type in ('IN', 'OUT')),
  source text not null default 'camera' check (source in ('camera', 'upload')),
  status text not null default 'accepted' check (status in ('accepted', 'duplicate', 'rejected')),
  reject_reason text,
  note text,
  scanned_at timestamptz not null default now(),
  client_scanned_at timestamptz,
  gateway_fetched_at timestamptz,
  employee_name_snapshot text,
  department_snapshot text,
  branch_snapshot text,
  check_in_snapshot text,
  check_out_snapshot text,
  raw_qr_payload text,
  operator_user_id uuid references auth.users on delete set null,
  operator_username_snapshot text,
  device_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attendance_scan_events_request_id_key unique (request_id)
);

alter table public.attendance_scan_events
  add column if not exists operator_username_snapshot text;

alter table public.attendance_scan_events
  drop column if exists station_id;

alter table public.attendance_scan_events
  drop column if exists app_version;

create index if not exists attendance_scan_events_scanned_at_idx
  on public.attendance_scan_events (scanned_at desc);

create index if not exists attendance_scan_events_employee_scanned_at_idx
  on public.attendance_scan_events (employee_code, scanned_at desc);

create index if not exists attendance_scan_events_status_scanned_at_idx
  on public.attendance_scan_events (status, scanned_at desc);

alter table public.attendance_scan_events enable row level security;

drop policy if exists attendance_scan_events_select_policy on public.attendance_scan_events;
create policy attendance_scan_events_select_policy
  on public.attendance_scan_events
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-attendance')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists attendance_scan_events_insert_policy on public.attendance_scan_events;
create policy attendance_scan_events_insert_policy
  on public.attendance_scan_events
  for insert
  with check (
    public.is_admin()
    or public.has_permission('admin-attendance')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists attendance_scan_events_update_admin_only on public.attendance_scan_events;
create policy attendance_scan_events_update_admin_only
  on public.attendance_scan_events
  for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists attendance_scan_events_delete_admin_only on public.attendance_scan_events;
create policy attendance_scan_events_delete_admin_only
  on public.attendance_scan_events
  for delete
  using (public.is_admin());
