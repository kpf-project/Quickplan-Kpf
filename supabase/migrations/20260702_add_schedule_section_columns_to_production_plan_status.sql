-- Add schedule section trace columns for WIP subplan flow
-- This supports workstream-aware requisition preview and document splitting.

ALTER TABLE public.production_plan_status
  ADD COLUMN IF NOT EXISTS schedule_section_def_id text;

ALTER TABLE public.production_plan_status
  ADD COLUMN IF NOT EXISTS schedule_section_name text;

CREATE INDEX IF NOT EXISTS production_plan_status_schedule_section_def_id_idx
  ON public.production_plan_status (schedule_section_def_id);

