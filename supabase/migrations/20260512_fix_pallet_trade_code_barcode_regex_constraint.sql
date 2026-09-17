alter table public.pallet_trade_code_barcodes
  drop constraint if exists pallet_trade_code_barcodes_value_check;

alter table public.pallet_trade_code_barcodes
  add constraint pallet_trade_code_barcodes_value_check
  check (product_barcode ~ '^[A-Z0-9._:/-]{2,80}$');
