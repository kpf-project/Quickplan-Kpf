-- CSV: 148,638 calls / 30.24% cumulative database time.
-- Verified plan filtered 37,813 movement rows to return 95 rows (65.36 ms).
-- The partial predicate matches the existing available-weight lookup exactly.
CREATE INDEX IF NOT EXISTS production_stock_movements_source_receipt_lookup_idx
  ON public.production_stock_movements ((metadata->>'sourceReceiptId'))
  WHERE movement_type IN ('issue_out', 'adjustment_in');
