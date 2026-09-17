create table if not exists public.pallet_trade_code_barcodes (
  goods_code text primary key,
  sku_code text not null,
  product_barcode text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint pallet_trade_code_barcodes_goods_code_check check (length(trim(goods_code)) > 0),
  constraint pallet_trade_code_barcodes_sku_code_check check (length(trim(sku_code)) > 0),
  constraint pallet_trade_code_barcodes_value_check check (product_barcode ~ '^[A-Z0-9\\-._:/]{2,80}$')
);

create unique index if not exists pallet_trade_code_barcodes_value_uidx
  on public.pallet_trade_code_barcodes (product_barcode);

create index if not exists pallet_trade_code_barcodes_sku_code_idx
  on public.pallet_trade_code_barcodes (sku_code);

alter table public.pallet_qty_scan_logs
  add column if not exists goods_code_snapshot text null;

create index if not exists pallet_qty_scan_logs_goods_code_idx
  on public.pallet_qty_scan_logs (goods_code_snapshot);

alter table public.pallet_trade_code_barcodes enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pallet_trade_code_barcodes'
      and policyname = 'pallet_trade_code_barcodes_read'
  ) then
    create policy pallet_trade_code_barcodes_read
      on public.pallet_trade_code_barcodes
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
      and tablename = 'pallet_trade_code_barcodes'
      and policyname = 'pallet_trade_code_barcodes_manage'
  ) then
    create policy pallet_trade_code_barcodes_manage
      on public.pallet_trade_code_barcodes
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
