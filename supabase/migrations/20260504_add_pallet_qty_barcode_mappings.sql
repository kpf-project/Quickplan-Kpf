create table if not exists public.pallet_qty_barcodes (
  id uuid primary key default gen_random_uuid(),
  barcode_value text not null,
  display_qty integer not null,
  label text null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint pallet_qty_barcodes_value_check check (barcode_value ~ '^QTY:[0-9]{3,5}$'),
  constraint pallet_qty_barcodes_display_qty_check check (display_qty between 1 and 99999)
);

create unique index if not exists pallet_qty_barcodes_barcode_value_uidx
  on public.pallet_qty_barcodes (barcode_value);

create unique index if not exists pallet_qty_barcodes_display_qty_uidx
  on public.pallet_qty_barcodes (display_qty);

create table if not exists public.product_barcodes (
  sku_code text primary key,
  product_barcode text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint product_barcodes_sku_code_check check (length(trim(sku_code)) > 0),
  constraint product_barcodes_value_check check (product_barcode ~ '^[A-Z0-9\\-._:/]{2,80}$')
);

create unique index if not exists product_barcodes_value_uidx
  on public.product_barcodes (product_barcode);

create table if not exists public.pallet_qty_category_mappings (
  iccat_code text primary key,
  qty_barcode_id uuid not null references public.pallet_qty_barcodes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint pallet_qty_category_mappings_iccat_code_check check (length(trim(iccat_code)) > 0)
);

create index if not exists pallet_qty_category_mappings_qty_barcode_idx
  on public.pallet_qty_category_mappings (qty_barcode_id);

create table if not exists public.pallet_qty_sku_mappings (
  sku_code text primary key,
  qty_barcode_id uuid not null references public.pallet_qty_barcodes(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint pallet_qty_sku_mappings_sku_code_check check (length(trim(sku_code)) > 0)
);

create index if not exists pallet_qty_sku_mappings_qty_barcode_idx
  on public.pallet_qty_sku_mappings (qty_barcode_id);

create table if not exists public.pallet_qty_scan_logs (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz not null default timezone('utc', now()),
  sku_code text not null,
  sku_name_snapshot text null,
  iccat_code_snapshot text null,
  iccat_name_snapshot text null,
  unit_snapshot text null,
  product_barcode text not null,
  qty_barcode_value text not null,
  qty_display integer not null,
  confirmed_default boolean not null,
  actual_qty integer not null,
  recorded_by uuid null references public.profiles(id) on delete set null,
  recorded_by_username text null,
  machine_code text null,
  doc_no text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint pallet_qty_scan_logs_qty_display_check check (qty_display between 1 and 99999),
  constraint pallet_qty_scan_logs_actual_qty_check check (actual_qty between 1 and 99999)
);

create index if not exists pallet_qty_scan_logs_scanned_at_idx
  on public.pallet_qty_scan_logs (scanned_at desc);

create index if not exists pallet_qty_scan_logs_sku_code_idx
  on public.pallet_qty_scan_logs (sku_code);
