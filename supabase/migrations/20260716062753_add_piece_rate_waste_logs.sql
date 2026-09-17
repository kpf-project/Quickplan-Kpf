create table if not exists public.production_piece_rate_waste_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  product_barcode_snapshot text not null,
  product_code_snapshot text not null,
  product_goods_code_snapshot text,
  product_sku_code_snapshot text,
  product_name_snapshot text not null,
  product_brand_code_snapshot text,
  product_brand_name_snapshot text,
  product_unit_snapshot text,
  waste_weight_kg numeric(12, 3) not null,
  machine_code text not null,
  raw_product_barcode_payload text,
  actual_weighed_at timestamptz not null,
  logged_at timestamptz not null default now(),
  operator_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'confirmed',
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  constraint production_piece_rate_waste_logs_request_id_not_blank
    check (btrim(request_id) <> ''),
  constraint production_piece_rate_waste_logs_barcode_not_blank
    check (btrim(product_barcode_snapshot) <> ''),
  constraint production_piece_rate_waste_logs_product_code_not_blank
    check (btrim(product_code_snapshot) <> ''),
  constraint production_piece_rate_waste_logs_weight_positive
    check (waste_weight_kg > 0),
  constraint production_piece_rate_waste_logs_machine_code_format
    check (machine_code ~ '^[A-Z0-9]{2,8}$'),
  constraint production_piece_rate_waste_logs_status_check
    check (status in ('confirmed', 'cancelled')),
  constraint production_piece_rate_waste_logs_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_piece_rate_waste_logs_active_date_idx
  on public.production_piece_rate_waste_logs (actual_weighed_at desc)
  where status = 'confirmed';

create index if not exists production_piece_rate_waste_logs_active_product_date_idx
  on public.production_piece_rate_waste_logs (
    product_goods_code_snapshot,
    actual_weighed_at desc
  )
  where status = 'confirmed';

create index if not exists production_piece_rate_waste_logs_operator_date_idx
  on public.production_piece_rate_waste_logs (operator_user_id, actual_weighed_at desc)
  where operator_user_id is not null;

alter table public.production_piece_rate_waste_logs enable row level security;

revoke all on public.production_piece_rate_waste_logs from anon, authenticated;
grant select, insert on public.production_piece_rate_waste_logs to service_role;

comment on table public.production_piece_rate_waste_logs is
  'Independent line-production waste weights captured from the piece-rate scanner; never used for wages or stock movements.';
