create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  session_id uuid not null,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists user_sessions_user_session_key
  on public.user_sessions (user_id, session_id);

create index if not exists user_sessions_user_id_idx
  on public.user_sessions (user_id);

create index if not exists user_sessions_user_created_idx
  on public.user_sessions (user_id, created_at);

create index if not exists user_sessions_user_active_idx
  on public.user_sessions (user_id, revoked_at);

alter table public.user_sessions enable row level security;

drop policy if exists user_sessions_admin_all on public.user_sessions;
create policy user_sessions_admin_all
  on public.user_sessions
  for all
  using (public.is_admin())
  with check (public.is_admin());
