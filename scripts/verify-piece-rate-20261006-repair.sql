select
  l.doc_no,
  l.employee_code,
  l.employee_name_snapshot,
  l.product_code_snapshot,
  l.product_name_snapshot,
  l.product_barcode_snapshot,
  l.lot_no,
  l.input_value,
  l.wage_amount_snapshot,
  m.product_code as movement_product_code,
  m.lot_no as movement_lot_no,
  m.weight_in_kg
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.doc_no in ('20261006068', '20261006069', '20261006070')
order by l.doc_no;
