alter table if exists public.production_plan_status
  add column if not exists master_published_at timestamptz,
  add column if not exists master_published_by text,
  add column if not exists master_published_by_user_id uuid references auth.users(id);

create index if not exists idx_plan_status_master_published_at
  on public.production_plan_status (master_published_at desc);

create index if not exists idx_plan_status_group_published
  on public.production_plan_status (plan_group_id, master_published_at);
