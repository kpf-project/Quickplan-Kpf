alter table public.production_piece_rate_logs
  add column if not exists lot_no text;

create index if not exists production_piece_rate_logs_lot_no_logged_at_idx
  on public.production_piece_rate_logs (lot_no, logged_at desc);
