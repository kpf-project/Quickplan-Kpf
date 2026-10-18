ALTER TABLE public.production_cost_sheet_items
  ADD COLUMN IF NOT EXISTS bom_qty NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS issued_qty NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS allocation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS exception_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT;

ALTER TABLE public.production_cost_sheet_items
  DROP CONSTRAINT IF EXISTS production_cost_sheet_items_allocation_status_check;

ALTER TABLE public.production_cost_sheet_items
  ADD CONSTRAINT production_cost_sheet_items_allocation_status_check
  CHECK (allocation_status IN (
    'pending',
    'proposed',
    'matched',
    'confirmed',
    'missing_issue',
    'shared_issue',
    'pending_price',
    'pending_upstream',
    'manual_review'
  ));
