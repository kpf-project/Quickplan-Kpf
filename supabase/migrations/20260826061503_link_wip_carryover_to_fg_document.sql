alter table public.production_wip_can_movements
  add column if not exists target_document_id uuid
    references public.production_fg_wip_documents(id) on delete set null;

create index if not exists production_wip_can_movements_target_document_idx
  on public.production_wip_can_movements (target_document_id)
  where target_document_id is not null;

comment on column public.production_wip_can_movements.target_document_id is
  'FG/WIP end-of-day document that consumed this carried-over WIP issue; null on historical rows and non-production issues.';
