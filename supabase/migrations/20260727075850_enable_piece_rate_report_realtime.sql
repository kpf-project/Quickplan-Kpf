do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'production_piece_rate_logs'
  ) then
    alter publication supabase_realtime
      add table public.production_piece_rate_logs;
  end if;
end
$$;
