begin read only;

select
  to_regprocedure('public.create_production_stock_issue(text,text,uuid,text,date)') is not null guarded_function_exists,
  not has_function_privilege('service_role','public.create_production_stock_issue_core(text,text,uuid,text)','execute') core_function_blocked,
  has_function_privilege('service_role','public.create_production_stock_issue(text,text,uuid,text)','execute') compatibility_function_allowed,
  has_function_privilege('service_role','public.create_production_stock_issue(text,text,uuid,text,date)','execute') guarded_function_allowed,
  position('pg_advisory_xact_lock' in pg_get_functiondef(
    'public.create_production_stock_issue(text,text,uuid,text,date)'::regprocedure))>0 lot_lock_exists,
  position('v_lot_balance_weight_kg < 0' in pg_get_functiondef(
    'public.create_production_stock_issue(text,text,uuid,text,date)'::regprocedure))>0 negative_guard_exists;

commit;
