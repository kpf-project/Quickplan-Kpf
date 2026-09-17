create unique index if not exists production_weight_receipts_barcode_uidx
  on public.production_weight_receipts (barcode)
  where barcode is not null;
