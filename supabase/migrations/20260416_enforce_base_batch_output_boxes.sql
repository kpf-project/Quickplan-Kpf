-- Enforce new BOM base metrics as the primary source of truth.
-- Keep base_boxes as deprecated for backward compatibility only.

UPDATE public.production_bom_versions
SET
  base_batch = COALESCE(NULLIF(base_batch, 0), NULLIF(base_boxes, 0), 1),
  base_output_boxes = COALESCE(NULLIF(base_output_boxes, 0), NULLIF(base_boxes, 0), 1)
WHERE
  base_batch IS NULL
  OR base_batch <= 0
  OR base_output_boxes IS NULL
  OR base_output_boxes <= 0;

ALTER TABLE public.production_bom_versions
  ALTER COLUMN base_batch SET DEFAULT 1,
  ALTER COLUMN base_batch SET NOT NULL,
  ALTER COLUMN base_output_boxes SET DEFAULT 1,
  ALTER COLUMN base_output_boxes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'production_bom_versions_base_batch_positive'
  ) THEN
    ALTER TABLE public.production_bom_versions
      ADD CONSTRAINT production_bom_versions_base_batch_positive
      CHECK (base_batch > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'production_bom_versions_base_output_boxes_positive'
  ) THEN
    ALTER TABLE public.production_bom_versions
      ADD CONSTRAINT production_bom_versions_base_output_boxes_positive
      CHECK (base_output_boxes > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.production_bom_versions.base_boxes
IS 'DEPRECATED: use base_batch + base_output_boxes';
