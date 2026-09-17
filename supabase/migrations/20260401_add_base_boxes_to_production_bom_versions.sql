-- Support BOM quantities defined for a reference number of boxes
alter table if exists public.production_bom_versions
  add column if not exists base_boxes numeric not null default 1;

alter table if exists public.production_bom_versions
  add constraint production_bom_versions_base_boxes_check
    check (base_boxes > 0);

create index if not exists production_bom_versions_base_boxes_idx
  on public.production_bom_versions (base_boxes);

