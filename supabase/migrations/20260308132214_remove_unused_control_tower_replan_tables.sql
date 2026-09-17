-- Remove unused planning control-tower/replan persistence tables.
-- Safe for fresh environments and reruns.
DROP TABLE IF EXISTS public.production_material_eta_feedback;
DROP TABLE IF EXISTS public.production_replan_jobs;
