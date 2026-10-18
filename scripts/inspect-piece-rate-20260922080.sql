begin transaction read only;
select to_jsonb(l) from production_piece_rate_logs l where doc_no = '20260922080';
select to_jsonb(m) from production_stock_movements m join production_piece_rate_logs l on l.stock_movement_id=m.id where l.doc_no='20260922080';
select to_jsonb(p) - 'image_url' from products_cache p where sku_code='WKB-0066';
select to_jsonb(b) from pallet_trade_code_barcodes b where goods_code='WKB-0066';
select to_jsonb(p) from production_piece_rate_product_mappings p where product_code='WKB-0066';
select 'issue',to_jsonb(i) from production_piece_rate_stock_issues i join production_piece_rate_logs l on l.id=i.piece_rate_log_id where l.doc_no='20260922080';
select 'return',to_jsonb(r) from production_piece_rate_stock_returns r join production_piece_rate_logs l on l.id=r.piece_rate_log_id where l.doc_no='20260922080';
rollback;
