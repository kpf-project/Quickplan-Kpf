alter table public.production_work_centers
  add column if not exists consolidate_requisition_preview_by_date boolean;

update public.production_work_centers
set consolidate_requisition_preview_by_date = false
where consolidate_requisition_preview_by_date is null;

alter table public.production_work_centers
  alter column consolidate_requisition_preview_by_date set default false;

alter table public.production_work_centers
  alter column consolidate_requisition_preview_by_date set not null;

comment on column public.production_work_centers.consolidate_requisition_preview_by_date is
  'When true, requisition Preview shows one consolidated material total per production date for this room while retaining per-FG source quantities.';
