create table if not exists public.production_piece_rate_realtime_signals (
  topic text primary key,
  changed_at timestamptz not null default clock_timestamp(),
  constraint production_piece_rate_realtime_signals_topic_check
    check (topic = 'report')
);

insert into public.production_piece_rate_realtime_signals (topic)
values ('report')
on conflict (topic) do nothing;

alter table public.production_piece_rate_realtime_signals
  enable row level security;

revoke all on public.production_piece_rate_realtime_signals
  from anon, authenticated;

grant select on public.production_piece_rate_realtime_signals
  to anon, authenticated;

drop policy if exists production_piece_rate_realtime_signals_read
  on public.production_piece_rate_realtime_signals;

create policy production_piece_rate_realtime_signals_read
  on public.production_piece_rate_realtime_signals
  for select
  to anon, authenticated
  using (topic = 'report');

create or replace function private.signal_production_piece_rate_report_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.production_piece_rate_realtime_signals (
    topic,
    changed_at
  )
  values (
    'report',
    clock_timestamp()
  )
  on conflict (topic) do update
    set changed_at = excluded.changed_at;

  return null;
end;
$$;

revoke all on function private.signal_production_piece_rate_report_change()
  from public, anon, authenticated;

drop trigger if exists signal_production_piece_rate_report_change
  on public.production_piece_rate_logs;

create trigger signal_production_piece_rate_report_change
after insert or update or delete or truncate
on public.production_piece_rate_logs
for each statement
execute function private.signal_production_piece_rate_report_change();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'production_piece_rate_realtime_signals'
  ) then
    alter publication supabase_realtime
      add table public.production_piece_rate_realtime_signals;
  end if;
end
$$;

comment on table public.production_piece_rate_realtime_signals is
  'Non-sensitive invalidation signal used to refresh the piece-rate report for custom-authenticated clients.';
