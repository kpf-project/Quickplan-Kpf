alter table public.production_piece_rate_waste_logs
  add column if not exists waste_category text;

alter table public.production_piece_rate_waste_logs
  drop constraint if exists production_piece_rate_waste_logs_category_check;

alter table public.production_piece_rate_waste_logs
  add constraint production_piece_rate_waste_logs_category_check
  check (waste_category is null or waste_category in ('label_scrap', 'broken_scrap', 'burnt_scrap'));

create index if not exists production_piece_rate_waste_logs_active_category_date_idx
  on public.production_piece_rate_waste_logs (waste_category, actual_weighed_at desc)
  where status = 'confirmed';
