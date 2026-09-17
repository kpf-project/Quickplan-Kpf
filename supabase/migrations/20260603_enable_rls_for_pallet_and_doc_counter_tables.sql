alter table public.pallet_qty_barcodes enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.pallet_qty_category_mappings enable row level security;
alter table public.pallet_qty_sku_mappings enable row level security;
alter table public.pallet_qty_scan_logs enable row level security;
alter table public.production_daily_work_doc_counters enable row level security;
alter table public.production_daily_work_doc_counter_audits enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_barcodes'
      and policyname = 'pallet_qty_barcodes_read'
  ) then
    create policy pallet_qty_barcodes_read
      on public.pallet_qty_barcodes
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-view')
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-view')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_barcodes'
      and policyname = 'pallet_qty_barcodes_manage'
  ) then
    create policy pallet_qty_barcodes_manage
      on public.pallet_qty_barcodes
      for all
      using (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      )
      with check (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_barcodes'
      and policyname = 'product_barcodes_read'
  ) then
    create policy product_barcodes_read
      on public.product_barcodes
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-view')
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-view')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_barcodes'
      and policyname = 'product_barcodes_manage'
  ) then
    create policy product_barcodes_manage
      on public.product_barcodes
      for all
      using (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      )
      with check (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_category_mappings'
      and policyname = 'pallet_qty_category_mappings_read'
  ) then
    create policy pallet_qty_category_mappings_read
      on public.pallet_qty_category_mappings
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-view')
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-view')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_category_mappings'
      and policyname = 'pallet_qty_category_mappings_manage'
  ) then
    create policy pallet_qty_category_mappings_manage
      on public.pallet_qty_category_mappings
      for all
      using (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      )
      with check (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_sku_mappings'
      and policyname = 'pallet_qty_sku_mappings_read'
  ) then
    create policy pallet_qty_sku_mappings_read
      on public.pallet_qty_sku_mappings
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-view')
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-view')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_sku_mappings'
      and policyname = 'pallet_qty_sku_mappings_manage'
  ) then
    create policy pallet_qty_sku_mappings_manage
      on public.pallet_qty_sku_mappings
      for all
      using (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      )
      with check (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_scan_logs'
      and policyname = 'pallet_qty_scan_logs_read'
  ) then
    create policy pallet_qty_scan_logs_read
      on public.pallet_qty_scan_logs
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-view')
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-view')
        or has_permission('production-line-attendance-report-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_qty_scan_logs'
      and policyname = 'pallet_qty_scan_logs_manage'
  ) then
    create policy pallet_qty_scan_logs_manage
      on public.pallet_qty_scan_logs
      for all
      using (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
      )
      with check (
        is_admin()
        or has_permission('production-line-attendance-manage')
        or has_permission('production-line-attendance-report-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'production_daily_work_doc_counters'
      and policyname = 'production_daily_work_doc_counters_read'
  ) then
    create policy production_daily_work_doc_counters_read
      on public.production_daily_work_doc_counters
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'production_daily_work_doc_counter_audits'
      and policyname = 'production_daily_work_doc_counter_audits_read'
  ) then
    create policy production_daily_work_doc_counter_audits_read
      on public.production_daily_work_doc_counter_audits
      for select
      using (
        is_admin()
        or has_permission('production-line-attendance-report-manage')
        or has_permission('production-line-settings-manage')
      );
  end if;
end $$;
