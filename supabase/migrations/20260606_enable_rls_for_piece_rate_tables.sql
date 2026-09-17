begin;

alter table public.production_piece_rate_profiles enable row level security;
alter table public.production_piece_rate_product_mappings enable row level security;
alter table public.production_piece_rate_logs enable row level security;

drop policy if exists production_piece_rate_profiles_read on public.production_piece_rate_profiles;
create policy production_piece_rate_profiles_read
  on public.production_piece_rate_profiles
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_profiles_manage on public.production_piece_rate_profiles;
create policy production_piece_rate_profiles_manage
  on public.production_piece_rate_profiles
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_product_mappings_read on public.production_piece_rate_product_mappings;
create policy production_piece_rate_product_mappings_read
  on public.production_piece_rate_product_mappings
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_product_mappings_manage on public.production_piece_rate_product_mappings;
create policy production_piece_rate_product_mappings_manage
  on public.production_piece_rate_product_mappings
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_logs_read on public.production_piece_rate_logs;
create policy production_piece_rate_logs_read
  on public.production_piece_rate_logs
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_piece_rate_logs_insert on public.production_piece_rate_logs;
create policy production_piece_rate_logs_insert
  on public.production_piece_rate_logs
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_piece_rate_logs_update_manage on public.production_piece_rate_logs;
create policy production_piece_rate_logs_update_manage
  on public.production_piece_rate_logs
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

drop policy if exists production_piece_rate_logs_delete_admin_only on public.production_piece_rate_logs;
create policy production_piece_rate_logs_delete_admin_only
  on public.production_piece_rate_logs
  for delete
  using (public.is_admin());

commit;
