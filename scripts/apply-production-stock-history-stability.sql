begin;
\i supabase/migrations/20260908091549_stabilize_production_stock_history.sql

do $$
declare
  v_cancel_definition text := pg_get_functiondef(
    'public.cancel_production_stock_issue_item(uuid,uuid,text)'::regprocedure
  );
begin
  if public.production_stock_business_date(timestamptz '2026-09-08 05:59:00+07') <> date '2026-09-07'
     or public.production_stock_business_date(timestamptz '2026-09-08 06:00:59+07') <> date '2026-09-07'
     or public.production_stock_business_date(timestamptz '2026-09-08 06:01:00+07') <> date '2026-09-08' then
    raise exception 'Production date boundary verification failed';
  end if;

  if strpos(v_cancel_definition, 'cancellationProductionDate') = 0
     or strpos(v_cancel_definition, 'production_stock_business_date(v_now)') = 0 then
    raise exception 'Cancellation date verification failed';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_stock_issue_report_lines_v'
      and column_name = 'document_voided_at'
  ) then
    raise exception 'Report view verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
