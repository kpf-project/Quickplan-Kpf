begin;

select to_jsonb(l)
from public.production_piece_rate_logs l
where doc_no in ('20261006068', '20261006069', '20261006070')
order by doc_no;

select to_jsonb(m)
from public.production_stock_movements m
join public.production_piece_rate_logs l on l.stock_movement_id = m.id
where l.doc_no in ('20261006068', '20261006069', '20261006070')
order by m.source_document_no;

select to_jsonb(p)
from public.products_cache p
where p.sku_code in ('B06-0006', 'BL0-1009');

select to_jsonb(b)
from public.pallet_trade_code_barcodes b
where b.goods_code in ('B06-0006', 'BL0-1009') or b.sku_code in ('B06-0006', 'BL0-1009');

select 'issue', to_jsonb(i)
from public.production_piece_rate_stock_issues i
join public.production_piece_rate_logs l on l.id = i.piece_rate_log_id
where l.doc_no in ('20261006068', '20261006069', '20261006070');

select 'return', to_jsonb(r)
from public.production_piece_rate_stock_returns r
join public.production_piece_rate_logs l on l.id = r.piece_rate_log_id
where l.doc_no in ('20261006068', '20261006069', '20261006070');

rollback;
