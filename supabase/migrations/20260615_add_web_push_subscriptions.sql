create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  event_types text[] not null default array[
    'planning.master_published',
    'planning.subplan_confirmed'
  ]::text[],
  enabled boolean not null default true,
  user_agent text null,
  last_seen_at timestamptz null,
  last_error text null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id);

create index if not exists web_push_subscriptions_enabled_idx
  on public.web_push_subscriptions (enabled)
  where enabled = true and revoked_at is null;

alter table public.web_push_subscriptions enable row level security;

drop policy if exists web_push_subscriptions_admin_all on public.web_push_subscriptions;
create policy web_push_subscriptions_admin_all
  on public.web_push_subscriptions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists web_push_subscriptions_self_select on public.web_push_subscriptions;
create policy web_push_subscriptions_self_select
  on public.web_push_subscriptions
  for select
  using (auth.uid() = user_id);

drop policy if exists web_push_subscriptions_self_insert on public.web_push_subscriptions;
create policy web_push_subscriptions_self_insert
  on public.web_push_subscriptions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists web_push_subscriptions_self_update on public.web_push_subscriptions;
create policy web_push_subscriptions_self_update
  on public.web_push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
