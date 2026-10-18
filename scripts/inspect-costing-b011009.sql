SELECT 
  id,
  doc_no,
  product_goods_code_snapshot,
  actual_weighed_at,
  doc_status,
  replaced_by_log_id
FROM production_piece_rate_logs
WHERE doc_no IN ('20261003046', '20261003047', '20261003048');
