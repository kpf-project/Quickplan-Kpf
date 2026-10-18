-- ==============================================================================
-- Migration: 20261005001500_optimize_production_reports_sqlexpert.sql
-- Description: Database indexes & optimization per .agent/sqlexpert guidelines
--   - Query Optimization: Pushdown filters, covering indexes (INCLUDE), partial indexes
--   - Safe: Only creates non-destructive B-Tree indexes (CONCURRENTLY where applicable / IF NOT EXISTS)
-- ==============================================================================

-- 1. Covering composite index for Weight Scale Receipts Report
-- Order: Equality (status) -> Range/Sort (weighed_at) -> Filter (product_config_id)
-- Covering: INCLUDE (lot_id, net_weight_kg, pass_weight_kg, barcode) for Index-Only Scan
CREATE INDEX IF NOT EXISTS idx_production_weight_receipts_report_opt
  ON public.production_weight_receipts (status, weighed_at, product_config_id)
  INCLUDE (lot_id, net_weight_kg, pass_weight_kg, barcode);

-- 2. Partial composite index for Piece Rate Logs (Input-Output Report & Costing)
-- Order: Equality (doc_status) -> Range/Sort (actual_weighed_at)
-- Filter: WHERE replaced_by_log_id IS NULL (hot subset optimization per sqlexpert)
CREATE INDEX IF NOT EXISTS idx_piece_rate_logs_report_opt
  ON public.production_piece_rate_logs (doc_status, actual_weighed_at)
  WHERE replaced_by_log_id IS NULL;

-- 3. Composite index for Piece Rate Waste Logs (Input-Output Report)
-- Order: Equality (status) -> Range/Sort (actual_weighed_at)
CREATE INDEX IF NOT EXISTS idx_piece_rate_waste_logs_report_opt
  ON public.production_piece_rate_waste_logs (status, actual_weighed_at);

-- 4. Fast lookup index for active issue checks on receipts
CREATE INDEX IF NOT EXISTS idx_stock_issue_items_receipt_lookup
  ON public.production_stock_issue_items (source_receipt_id, status)
  WHERE source_receipt_id IS NOT NULL;

-- 5. Fast lookup index for weight receipt issues
CREATE INDEX IF NOT EXISTS idx_weight_receipt_issues_receipt_lookup
  ON public.production_weight_receipt_issues (receipt_id, status);
