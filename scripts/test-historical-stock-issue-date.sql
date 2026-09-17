begin;

set local statement_timeout = '20s';

do $$
declare
  v_test_date constant date := date '2026-09-05';
  v_barcode text;
  v_result jsonb;
  v_document_date date;
  v_movement_date date;
  v_duplicate_blocked boolean := false;
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'production_stock_issue_documents_guard_date'
      and not tgisinternal
  ) then
    raise exception 'Historical-date blocking trigger is still installed';
  end if;

  if has_function_privilege(
    'service_role',
    'public.create_production_stock_issue_core(text,text,uuid,text)',
    'execute'
  ) then
    raise exception 'Internal stock issue function is callable by service_role';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.create_production_stock_issue(text,text,uuid,text,date)',
    'execute'
  ) then
    raise exception 'Guarded stock issue function is unavailable to service_role';
  end if;

  select receipts.barcode
  into v_barcode
  from public.production_weight_receipts receipts
  join public.production_weight_scale_products products
    on products.id = receipts.product_config_id
  join public.production_departments departments
    on departments.id = products.department_id
  join public.products_cache cache
    on cache.sku_code = products.sku_code
  where receipts.status = 'recorded'
    and departments.code = 'KP13'
    and cache.iccat_code = '03'
    and case
      when coalesce(receipts.metadata->>'productionDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then (receipts.metadata->>'productionDate')::date
      else timezone('Asia/Bangkok', receipts.weighed_at)::date
    end <= v_test_date
    and not exists (
      select 1
      from public.production_stock_issue_items items
      join public.production_stock_issue_documents documents
        on documents.id = items.issue_document_id
      where items.source_receipt_id = receipts.id
        and items.status = 'confirmed'
        and documents.status = 'confirmed'
    )
  order by receipts.weighed_at desc
  limit 1;

  if v_barcode is null then
    raise exception 'No safe unissued receipt exists for rollback test on %', v_test_date;
  end if;

  v_result := public.create_production_stock_issue(
    v_barcode,
    'KPF',
    null,
    'ROLLBACK TEST: historical issue date',
    v_test_date
  );

  select issue_date
  into v_document_date
  from public.production_stock_issue_documents
  where id = (v_result->>'issueDocumentId')::uuid;

  select movement_date
  into v_movement_date
  from public.production_stock_movements
  where source_document_no = v_result->>'issueNo'
    and movement_type = 'issue_out';

  if (v_result->>'issueDate')::date <> v_test_date
     or v_document_date <> v_test_date
     or v_movement_date <> v_test_date then
    raise exception 'Selected date was not written consistently: result %, document %, movement %',
      v_result->>'issueDate', v_document_date, v_movement_date;
  end if;

  begin
    perform public.create_production_stock_issue(
      v_barcode,
      'KPF',
      null,
      'ROLLBACK TEST: duplicate issue',
      v_test_date
    );
  exception when others then
    v_duplicate_blocked := true;
  end;

  if not v_duplicate_blocked then
    raise exception 'Duplicate issue was accepted for barcode %', v_barcode;
  end if;

  raise notice 'PASS: barcode %, historical date %, duplicate blocked, all writes will rollback',
    v_barcode, v_test_date;
end;
$$;

rollback;
