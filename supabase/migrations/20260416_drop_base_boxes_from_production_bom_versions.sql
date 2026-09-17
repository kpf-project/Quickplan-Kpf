-- Remove deprecated base_boxes after migrating all consumers to
-- base_batch + base_output_boxes.

ALTER TABLE public.production_bom_versions
  DROP CONSTRAINT IF EXISTS production_bom_versions_base_boxes_check;

DROP INDEX IF EXISTS public.production_bom_versions_base_boxes_idx;

ALTER TABLE public.production_bom_versions
  DROP COLUMN IF EXISTS base_boxes;
