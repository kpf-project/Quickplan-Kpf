-- Store the actor who confirmed a production plan status record
alter table if exists public.production_plan_status
  add column if not exists confirmed_by text;

create index if not exists idx_plan_status_confirmed_by
  on public.production_plan_status (confirmed_by);

