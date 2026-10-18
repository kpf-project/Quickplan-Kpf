select jsonb_build_object(
  'columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_stock_issue_documents'
      and column_name in (
        'target_product_code',
        'target_product_name_snapshot',
        'target_product_category_code'
      )
  ),
  'single_rpc', to_regprocedure(
    'public.create_production_stock_issue(text,text,uuid,text,date,text)'
  ) is not null,
  'batch_rpc', to_regprocedure(
    'public.create_production_stock_issue_batch_atomic(text[],text,uuid,text,date,text)'
  ) is not null,
  'report_rpc', to_regprocedure(
    'public.get_production_stock_activity_summary_by_target(uuid,date,date,text[],text[])'
  ) is not null,
  'view_columns', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'production_stock_issue_report_lines_v'
      and column_name in (
        'target_product_code',
        'target_product_name_snapshot',
        'target_product_category_code'
      )
  )
);
