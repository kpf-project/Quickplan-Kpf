\pset null '(null)'

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'production_stock_issue_documents',
    'production_stock_issue_items',
    'production_stock_movements',
    'production_stock_issue_report_lines_v'
  )
  and column_name in (
    'destination_room_code', 'destination_room_name_snapshot',
    'target_product_code', 'target_product_name_snapshot', 'metadata'
  )
order by table_name, ordinal_position;

select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_production_stock_issue',
    'create_production_stock_issue_batch_atomic',
    'get_production_stock_activity_summary_by_room'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

select v.*
from public.production_stock_issue_report_lines_v v
where v.issue_date = date '2026-09-28'
  and v.product_code in ('WKB-0045', 'WKB-0048')
  and v.lot_no in ('1509260045-1', '2409260048-1')
order by v.product_code, v.barcode;

select m.*
from public.production_stock_movements m
where m.movement_date = date '2026-09-28'
  and m.product_code in ('WKB-0045', 'WKB-0048')
  and m.lot_no in ('1509260045-1', '2409260048-1')
order by m.product_code, m.source_document_no, m.movement_at;
