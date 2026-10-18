-- Create Production Costing tables for multi-stage process costing and drill-down
CREATE TABLE IF NOT EXISTS public.production_cost_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_no TEXT NOT NULL UNIQUE,
    cost_type TEXT NOT NULL CHECK (cost_type IN ('WIP', 'FG')),
    stage_key TEXT NOT NULL,
    sku_code TEXT NOT NULL,
    sku_name TEXT NOT NULL,
    lot_no TEXT NOT NULL,
    production_date DATE NOT NULL,
    master_plan_no TEXT,
    department_code TEXT,
    department_name TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'closed', 'problem')),
    planned_qty NUMERIC(14, 4) DEFAULT 0,
    actual_qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
    uom_name TEXT NOT NULL DEFAULT 'kg',
    waste_qty NUMERIC(14, 4) DEFAULT 0,
    waste_rate_pct NUMERIC(8, 2) DEFAULT 0,
    baking_yield_pct NUMERIC(8, 2),
    material_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    dl_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    overhead_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    total_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
    standard_unit_cost NUMERIC(14, 4) DEFAULT 0,
    variance_pct NUMERIC(8, 2) DEFAULT 0,
    closed_at TIMESTAMPTZ,
    closed_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_cost_sheet_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_sheet_id UUID NOT NULL REFERENCES public.production_cost_sheets(id) ON DELETE CASCADE,
    seq INT NOT NULL DEFAULT 1,
    item_type TEXT NOT NULL CHECK (item_type IN ('RM', 'WIP', 'PACKING')),
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    lot_no TEXT,
    qty NUMERIC(14, 4) NOT NULL DEFAULT 0,
    uom_name TEXT NOT NULL DEFAULT 'kg',
    unit_price NUMERIC(14, 4) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
    source_doc_ref TEXT,
    source_doc_date DATE,
    linked_cost_sheet_id UUID REFERENCES public.production_cost_sheets(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_cost_sheet_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_sheet_id UUID NOT NULL REFERENCES public.production_cost_sheets(id) ON DELETE CASCADE,
    expense_type TEXT NOT NULL CHECK (expense_type IN ('DL', 'OH')),
    description TEXT NOT NULL,
    qty NUMERIC(14, 4),
    uom_name TEXT,
    rate NUMERIC(14, 4),
    amount NUMERIC(14, 4) NOT NULL DEFAULT 0,
    remark TEXT,
    is_auto_fetched BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_sheets_date ON public.production_cost_sheets(production_date);
CREATE INDEX IF NOT EXISTS idx_cost_sheets_sku ON public.production_cost_sheets(sku_code);
CREATE INDEX IF NOT EXISTS idx_cost_sheets_lot ON public.production_cost_sheets(lot_no);
CREATE INDEX IF NOT EXISTS idx_cost_sheets_status ON public.production_cost_sheets(status);
CREATE INDEX IF NOT EXISTS idx_cost_sheet_items_sheet ON public.production_cost_sheet_items(cost_sheet_id);
CREATE INDEX IF NOT EXISTS idx_cost_sheet_expenses_sheet ON public.production_cost_sheet_expenses(cost_sheet_id);

GRANT ALL ON public.production_cost_sheets TO authenticated, service_role;
GRANT ALL ON public.production_cost_sheet_items TO authenticated, service_role;
GRANT ALL ON public.production_cost_sheet_expenses TO authenticated, service_role;
