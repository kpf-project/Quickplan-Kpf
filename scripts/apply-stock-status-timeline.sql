begin;
\i supabase/migrations/20260908100130_add_stock_status_timeline.sql

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_stock_issue_items'
      and column_name = 'restored_at'
  ) then
    raise exception 'Stock status timeline installation failed';
  end if;

  if (
    select count(*) from public.production_stock_issue_items
    where (
      metadata #>> '{historicalCorrection20260907,action}' = 'restore_source_issue'
      or metadata #>> '{historicalReturnChainRepair20260907,action}' = 'restore_source_issue'
    ) and restored_at is not null
  ) < 4 then
    raise exception 'Historical restoration timeline backfill failed';
  end if;

  if not exists (
    select 1
    from public.get_production_stock_opening_as_of(
      (select id from public.production_departments where code = 'KP13' limit 1),
      '03', date '2026-09-01', timestamptz '2026-09-02 23:59:59.999+07',
      null, array['WKB-0002','WKB-0048','WKB-0053']
    ) rows
    where rows.product_code = 'WKB-0002' and rows.lot_no = '1908260002-1'
      and rows.balance_quantity = 74 and rows.balance_weight_kg = 942.820
  ) then
    raise exception 'Historical opening aggregate verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
