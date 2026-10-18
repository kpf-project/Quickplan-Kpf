with scoped as (
  select * from public.production_piece_rate_logs
  where coalesce((metadata ->> 'workDate')::date, (actual_weighed_at at time zone 'Asia/Bangkok')::date) = date '2026-10-12'
    and product_code_snapshot in ('BL0-5030', 'WKB-0067', 'BL0-5032')
    and (doc_status = 'active' or doc_status is null)
    and replaced_by_log_id is null
)
select 'summary' as section, product_code_snapshot, count(*) as rows,
       sum(count_value_snapshot) as quantity, sum(normalized_kg_amount_snapshot) as weight_kg,
       min(doc_no) as first_doc, max(doc_no) as last_doc,
       array_agg(distinct lot_no order by lot_no) as lots
from scoped group by product_code_snapshot order by product_code_snapshot;

with scoped as (
  select * from public.production_piece_rate_logs
  where coalesce((metadata ->> 'workDate')::date, (actual_weighed_at at time zone 'Asia/Bangkok')::date) = date '2026-10-12'
    and product_code_snapshot in ('BL0-5030', 'WKB-0067', 'BL0-5032')
    and (doc_status = 'active' or doc_status is null)
    and replaced_by_log_id is null
)
select 'movement_summary' as section, m.product_code, count(*) as rows,
       sum(m.quantity_in) as quantity_in, sum(m.weight_in_kg) as weight_in_kg,
       sum(m.quantity_out) as quantity_out, sum(m.weight_out_kg) as weight_out_kg,
       array_agg(distinct m.lot_no order by m.lot_no) as lots
from public.production_stock_movements m join scoped l on l.stock_movement_id = m.id
group by m.product_code order by m.product_code;

with scoped as (
  select * from public.production_piece_rate_logs
  where coalesce((metadata ->> 'workDate')::date, (actual_weighed_at at time zone 'Asia/Bangkok')::date) = date '2026-10-12'
    and product_code_snapshot in ('BL0-5030', 'WKB-0067', 'BL0-5032')
    and (doc_status = 'active' or doc_status is null)
    and replaced_by_log_id is null
)
select 'downstream' as section, count(distinct i.id) as issue_rows, count(distinct r.id) as return_rows
from scoped l
left join public.production_piece_rate_stock_issues i on i.piece_rate_log_id = l.id
left join public.production_piece_rate_stock_returns r on r.piece_rate_log_id = l.id;

select 'product' as section, p.sku_code, p.sku_name, p.uom_name, p.is_active,
       array_remove(array_agg(distinct b.product_barcode), null) as barcodes
from public.products_cache p
left join public.pallet_trade_code_barcodes b on b.goods_code = p.sku_code and b.sku_code = p.sku_code
where p.sku_code in ('BL0-5030', 'WKB-0067', 'BL0-5032')
group by p.sku_code, p.sku_name, p.uom_name, p.is_active order by p.sku_code;

select 'jam_usage' as section, id, usage_date, goods_code, goods_name_snapshot, lot_no, weight_kg, status, created_at
from public.production_jam_usage_entries where usage_date = date '2026-10-12' order by created_at;
