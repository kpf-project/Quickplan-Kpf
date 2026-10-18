SELECT to_jsonb(w) FROM public.production_piece_rate_waste_logs w
WHERE coalesce(product_goods_code_snapshot, product_code_snapshot) = 'WKB-0064'
AND actual_weighed_at >= timestamptz '2026-10-08 00:00:00+07'
AND actual_weighed_at < timestamptz '2026-10-09 00:00:00+07'
AND waste_weight_kg = 16.82;
