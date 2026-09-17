create or replace function public.try_parse_timestamptz(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  return value::timestamptz;
exception
  when others then
    return null;
end;
$$;

alter table public.production_piece_rate_logs
  add column if not exists actual_weighed_at timestamptz
  generated always as (
    coalesce(
      public.try_parse_timestamptz(metadata #>> '{scaleAudit,capturedAt}'),
      logged_at
    )
  ) stored;

create index if not exists production_piece_rate_logs_actual_weighed_at_idx
  on public.production_piece_rate_logs (actual_weighed_at desc);

create index if not exists production_piece_rate_logs_doc_status_actual_weighed_at_idx
  on public.production_piece_rate_logs (doc_status, actual_weighed_at desc);
