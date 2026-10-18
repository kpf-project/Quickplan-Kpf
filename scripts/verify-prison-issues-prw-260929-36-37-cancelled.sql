select count(*) as remaining_movements
from public.production_stock_movements
where source_document_no in ('PRW-260929-000036-01', 'PRW-260929-000037-02');

select count(*) as remaining_headers
from public.production_piece_rate_prison_issues
where id = 'c6812743-081a-4256-a931-fa83d8ae8fbe';

select product_code, lot_no,
       round(sum(quantity_in - quantity_out), 3) as balance_quantity,
       round(sum(weight_in_kg - weight_out_kg), 3) as balance_weight_kg
from public.production_stock_movements
where product_code = 'WKB-0002-2' and lot_no in ('240926', '250926')
group by product_code, lot_no
order by lot_no;

select action, target_id, metadata -> 'cancelledBarcodes' as cancelled_barcodes, created_at
from public.audit_logs
where action = 'cancel_piece_rate_prison_issue_data_correction'
  and target_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
order by created_at desc
limit 1;
