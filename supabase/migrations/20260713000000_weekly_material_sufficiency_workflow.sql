-- 1. Add columns to production_master_plans
ALTER TABLE public.production_master_plans 
    ADD COLUMN IF NOT EXISTS reject_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id);

-- 2. Create production_plan_material_verifications table
CREATE TABLE IF NOT EXISTS public.production_plan_material_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_plan_no TEXT REFERENCES public.production_master_plans(master_plan_no) ON DELETE CASCADE,
    material_code TEXT NOT NULL,
    material_name TEXT NOT NULL,
    required_qty NUMERIC(15,4) NOT NULL,
    stock_qty NUMERIC(15,4) NOT NULL,
    shortage_qty NUMERIC(15,4) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- 'sufficient', 'shortage'
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.production_plan_material_verifications ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users read access (standard policy in the app)
DROP POLICY IF EXISTS select_all ON public.production_plan_material_verifications;
CREATE POLICY select_all ON public.production_plan_material_verifications
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users write access
DROP POLICY IF EXISTS insert_all ON public.production_plan_material_verifications;
CREATE POLICY insert_all ON public.production_plan_material_verifications
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS update_all ON public.production_plan_material_verifications;
CREATE POLICY update_all ON public.production_plan_material_verifications
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS delete_all ON public.production_plan_material_verifications;
CREATE POLICY delete_all ON public.production_plan_material_verifications
    FOR DELETE TO authenticated USING (true);
