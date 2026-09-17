alter table public.profiles
  add column if not exists line_user_id text,
  add column if not exists line_link_code text,
  add column if not exists line_linked_at timestamptz;

create unique index if not exists profiles_line_user_id_unique
  on public.profiles (line_user_id)
  where line_user_id is not null;

create index if not exists profiles_line_link_code_idx
  on public.profiles (line_link_code);
