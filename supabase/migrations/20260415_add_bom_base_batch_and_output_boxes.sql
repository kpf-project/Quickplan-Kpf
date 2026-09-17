alter table if exists public.production_bom_versions
  add column if not exists base_batch numeric;

alter table if exists public.production_bom_versions
  add column if not exists base_output_boxes numeric;

update public.production_bom_versions
set
  base_batch = coalesce(base_batch, nullif(base_boxes, 0), 1),
  base_output_boxes = coalesce(base_output_boxes, nullif(base_boxes, 0), 1)
where base_batch is null
   or base_output_boxes is null;

alter table if exists public.production_bom_versions
  alter column base_batch set default 1;

alter table if exists public.production_bom_versions
  alter column base_output_boxes set default 1;

alter table if exists public.production_bom_versions
  alter column base_batch set not null;

alter table if exists public.production_bom_versions
  alter column base_output_boxes set not null;

alter table if exists public.production_bom_versions
  drop constraint if exists production_bom_versions_base_batch_check;

alter table if exists public.production_bom_versions
  add constraint production_bom_versions_base_batch_check
    check (base_batch > 0);

alter table if exists public.production_bom_versions
  drop constraint if exists production_bom_versions_base_output_boxes_check;

alter table if exists public.production_bom_versions
  add constraint production_bom_versions_base_output_boxes_check
    check (base_output_boxes > 0);

create index if not exists production_bom_versions_base_batch_idx
  on public.production_bom_versions (base_batch);

create index if not exists production_bom_versions_base_output_boxes_idx
  on public.production_bom_versions (base_output_boxes);
