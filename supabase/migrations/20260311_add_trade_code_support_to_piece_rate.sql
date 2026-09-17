alter table public.production_piece_rate_product_mappings
  add column if not exists sku_code text null;

create index if not exists production_piece_rate_product_mappings_sku_code_idx
  on public.production_piece_rate_product_mappings (sku_code);

update public.production_piece_rate_product_mappings
set sku_code = coalesce(nullif(trim(sku_code), ''), product_code)
where sku_code is null or trim(sku_code) = '';

alter table public.production_piece_rate_logs
  add column if not exists product_goods_code_snapshot text null,
  add column if not exists product_sku_code_snapshot text null;

create index if not exists production_piece_rate_logs_product_goods_code_idx
  on public.production_piece_rate_logs (product_goods_code_snapshot, logged_at desc);

create index if not exists production_piece_rate_logs_product_sku_code_idx
  on public.production_piece_rate_logs (product_sku_code_snapshot, logged_at desc);

update public.production_piece_rate_logs
set
  product_goods_code_snapshot = coalesce(nullif(trim(product_goods_code_snapshot), ''), product_code_snapshot),
  product_sku_code_snapshot = coalesce(nullif(trim(product_sku_code_snapshot), ''), product_code_snapshot)
where
  product_goods_code_snapshot is null
  or trim(product_goods_code_snapshot) = ''
  or product_sku_code_snapshot is null
  or trim(product_sku_code_snapshot) = '';
