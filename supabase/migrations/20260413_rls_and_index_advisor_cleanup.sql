begin;

-- Normalize RLS policies for production_bom_formulas to avoid overlapping permissive SELECT policies
drop policy if exists production_bom_formulas_manage on public.production_bom_formulas;
drop policy if exists production_bom_formulas_read on public.production_bom_formulas;

create policy production_bom_formulas_read
  on public.production_bom_formulas
  for select
  using (
    is_admin()
    or has_permission('production-line-bom-view')
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_formulas_insert
  on public.production_bom_formulas
  for insert
  with check (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_formulas_update
  on public.production_bom_formulas
  for update
  using (
    is_admin()
    or has_permission('production-line-bom-manage')
  )
  with check (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_formulas_delete
  on public.production_bom_formulas
  for delete
  using (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

-- Harden overly permissive policies on production_plan_status
drop policy if exists production_plan_status_select_authenticated on public.production_plan_status;
drop policy if exists production_plan_status_insert_authenticated on public.production_plan_status;
drop policy if exists production_plan_status_update_authenticated on public.production_plan_status;
drop policy if exists production_plan_status_delete_authenticated on public.production_plan_status;

create policy production_plan_status_select_authenticated
  on public.production_plan_status
  for select
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-view')
    or has_permission('production-line-planning-manage')
  );

create policy production_plan_status_insert_authenticated
  on public.production_plan_status
  for insert
  to authenticated
  with check (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

create policy production_plan_status_update_authenticated
  on public.production_plan_status
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

create policy production_plan_status_delete_authenticated
  on public.production_plan_status
  for delete
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-planning-manage')
  );

-- Add missing policies to production_bom_approval_logs (RLS was enabled without policy)
drop policy if exists production_bom_approval_logs_select_authenticated on public.production_bom_approval_logs;
drop policy if exists production_bom_approval_logs_insert_authenticated on public.production_bom_approval_logs;
drop policy if exists production_bom_approval_logs_update_authenticated on public.production_bom_approval_logs;
drop policy if exists production_bom_approval_logs_delete_authenticated on public.production_bom_approval_logs;

create policy production_bom_approval_logs_select_authenticated
  on public.production_bom_approval_logs
  for select
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-bom-view')
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_approval_logs_insert_authenticated
  on public.production_bom_approval_logs
  for insert
  to authenticated
  with check (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_approval_logs_update_authenticated
  on public.production_bom_approval_logs
  for update
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-bom-manage')
  )
  with check (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

create policy production_bom_approval_logs_delete_authenticated
  on public.production_bom_approval_logs
  for delete
  to authenticated
  using (
    is_admin()
    or has_permission('production-line-bom-manage')
  );

-- Add covering indexes for FK columns reported by Supabase advisors
create index if not exists attendance_scan_events_operator_user_id_idx on public.attendance_scan_events (operator_user_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists profiles_created_by_idx on public.profiles (created_by);
create index if not exists profiles_department_id_idx on public.profiles (department_id);
create index if not exists profiles_updated_by_idx on public.profiles (updated_by);
create index if not exists role_permissions_created_by_idx on public.role_permissions (created_by);
create index if not exists role_permissions_permission_id_idx on public.role_permissions (permission_id);
create index if not exists roles_created_by_idx on public.roles (created_by);
create index if not exists roles_updated_by_idx on public.roles (updated_by);
create index if not exists user_roles_created_by_idx on public.user_roles (created_by);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);

commit;
