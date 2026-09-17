create table if not exists public.production_requisition_preview_drafts (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  master_plan_no text not null,
  date_from date null,
  date_to date null,
  draft_payload jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_requisition_preview_drafts_payload_is_object
    check (jsonb_typeof(draft_payload) = 'object')
);

create index if not exists production_requisition_preview_drafts_master_plan_idx
  on public.production_requisition_preview_drafts (master_plan_no);

create index if not exists production_requisition_preview_drafts_updated_at_idx
  on public.production_requisition_preview_drafts (updated_at desc);

alter table public.production_requisition_preview_drafts enable row level security;

revoke all on public.production_requisition_preview_drafts from anon;
revoke all on public.production_requisition_preview_drafts from authenticated;

comment on table public.production_requisition_preview_drafts is
  'Draft overrides for production requisition preview before generating final requisition documents.';

comment on column public.production_requisition_preview_drafts.scope_key is
  'Unique preview scope key built from master plan number and optional date range.';

comment on column public.production_requisition_preview_drafts.draft_payload is
  'JSON object keyed by preview documentKey. Each value stores normalized requisition lines for that draft document.';
