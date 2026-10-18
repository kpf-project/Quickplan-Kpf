select *
from public.get_production_stock_activity_summary_by_room(
  '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'::uuid,
  date '2026-09-28',
  date '2026-09-28',
  array['KPF']::text[],
  array['WKB-0045', 'WKB-0048']::text[]
)
order by product_code, lot_no, destination_room_code;
