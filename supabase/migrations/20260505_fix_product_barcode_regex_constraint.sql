alter table public.product_barcodes
  drop constraint if exists product_barcodes_value_check;

alter table public.product_barcodes
  add constraint product_barcodes_value_check
  check (product_barcode ~ '^[A-Z0-9._:/-]{2,80}$');
