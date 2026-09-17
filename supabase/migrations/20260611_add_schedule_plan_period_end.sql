-- ============================================================
-- Production schedule plan date range support
-- 2026-06-11
--
-- Make schedule plans unique by department + start date + end date
-- so multiple plans can share the same start date with different ranges.
-- Existing weekly plans are backfilled to a Monday-Saturday range.
-- ============================================================

ALTER TABLE public.production_schedule_plans
  ADD COLUMN IF NOT EXISTS period_end date;

UPDATE public.production_schedule_plans
SET period_end = COALESCE(period_end, week_start_date + 5)
WHERE period_end IS NULL;

ALTER TABLE public.production_schedule_plans
  ALTER COLUMN period_end SET NOT NULL;

ALTER TABLE public.production_schedule_plans
  DROP CONSTRAINT IF EXISTS production_schedule_plans_dept_id_week_start_date_key;

ALTER TABLE public.production_schedule_plans
  ADD CONSTRAINT production_schedule_plans_dept_id_week_start_date_period_end_key
  UNIQUE (dept_id, week_start_date, period_end);

ALTER TABLE public.production_schedule_plans
  DROP CONSTRAINT IF EXISTS production_schedule_plans_period_end_check;

ALTER TABLE public.production_schedule_plans
  ADD CONSTRAINT production_schedule_plans_period_end_check
  CHECK (period_end >= week_start_date);

DROP INDEX IF EXISTS public.idx_sched_plans_dept_week;

CREATE INDEX IF NOT EXISTS idx_sched_plans_dept_period
  ON public.production_schedule_plans(dept_id, week_start_date DESC, period_end DESC);
