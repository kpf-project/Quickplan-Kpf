do $$
declare
  v_previous_scope text := concat('DEP', '-BIS');
  v_active_scope text := 'KP13';
  v_issue_signature regprocedure := 'public.create_production_stock_issue(text,text,uuid,text)'::regprocedure;
  v_receipt_sync_signature regprocedure := 'public.sync_production_weight_receipt_stock_movement()'::regprocedure;
begin
  if to_regprocedure('public.create_production_stock_issue(text,text,uuid,text)') is not null then
    execute replace(
      pg_get_functiondef(v_issue_signature),
      v_previous_scope,
      v_active_scope
    );
  end if;

  if to_regprocedure('public.sync_production_weight_receipt_stock_movement()') is not null then
    execute replace(
      pg_get_functiondef(v_receipt_sync_signature),
      v_previous_scope,
      v_active_scope
    );
  end if;
end;
$$;
