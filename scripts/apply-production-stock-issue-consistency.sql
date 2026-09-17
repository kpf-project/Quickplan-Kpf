begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

\i supabase/migrations/20260907092922_harden_production_stock_issue_consistency.sql

do $$
declare v_definition text;
begin
  if to_regprocedure('public.create_production_stock_issue(text,text,uuid,text,date)') is null then
    raise exception 'Guarded stock issue function was not created';
  end if;
  select pg_get_functiondef('public.create_production_stock_issue(text,text,uuid,text,date)'::regprocedure)
    into v_definition;
  if position('pg_advisory_xact_lock' in v_definition)=0
     or position('v_lot_balance_weight_kg < 0' in v_definition)=0 then
    raise exception 'LOT consistency guard is incomplete';
  end if;
  if has_function_privilege('service_role',
       'public.create_production_stock_issue_core(text,text,uuid,text)','execute')
     or not has_function_privilege('service_role',
       'public.create_production_stock_issue(text,text,uuid,text)','execute')
     or not has_function_privilege('service_role',
       'public.create_production_stock_issue(text,text,uuid,text,date)','execute') then
    raise exception 'Function privileges are unsafe';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif
