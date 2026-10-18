\pset null '(null)'

select h.*, i.*, m.*
from public.production_piece_rate_prison_issue_items i
join public.production_piece_rate_prison_issues h on h.id = i.issue_id
join public.production_stock_movements m on m.id = i.stock_movement_id
where m.source_document_type = 'piece_rate_prison_issue'
  and m.source_document_no in ('PRW-260929-000036-01', 'PRW-260929-000037-02')
order by m.source_document_no;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'production_piece_rate_prison_issues',
    'production_piece_rate_prison_issue_items',
    'production_stock_movements'
  )
order by table_name, ordinal_position;

select product_code, lot_no,
       round(sum(quantity_in - quantity_out), 3) as balance_quantity,
       round(sum(weight_in_kg - weight_out_kg), 3) as balance_weight_kg
from public.production_stock_movements
where product_code = 'WKB-0002-2'
  and lot_no in ('240926', '250926')
group by product_code, lot_no
order by lot_no;

select conrelid::regclass as child_table,
       conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid in (
    'public.production_piece_rate_prison_issues'::regclass,
    'public.production_piece_rate_prison_issue_items'::regclass,
    'public.production_stock_movements'::regclass
  )
order by conrelid::regclass::text, conname;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
order by ordinal_position;
