BEGIN READ ONLY;
SELECT r.status,coalesce(r.metadata->>'isReturn','false') AS is_return,count(*) AS rows,sum(r.net_weight_kg) AS kg,min(r.weighed_at) AS first_receipt,max(r.weighed_at) AS last_receipt FROM production_weight_receipts r JOIN production_weight_scale_lots l ON l.id=r.lot_id JOIN production_weight_scale_products p ON p.id=r.product_config_id WHERE l.lot_code='0909260048-1' AND p.sku_code='WKB-0048' GROUP BY 1,2;
SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('production_schedule_rows','production_plan_status','production_sub_plans','production_bom_items','production_boms') ORDER BY table_name,ordinal_position;
SELECT d.issue_date,d.status,i.status,count(*) AS rows,sum(i.weight_kg) AS kg FROM production_stock_issue_items i JOIN production_stock_issue_documents d ON d.id=i.issue_document_id WHERE i.product_code='WKB-0048' AND i.lot_no='0909260048-1' GROUP BY 1,2,3 ORDER BY 1;
ROLLBACK;
