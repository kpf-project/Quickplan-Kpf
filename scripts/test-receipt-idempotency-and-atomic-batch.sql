begin;

do $$
declare
  v_receipt public.production_weight_receipts%rowtype;
  v_request_id uuid := gen_random_uuid();
  v_duplicate_blocked boolean := false;
begin
  select * into v_receipt
  from public.production_weight_receipts
  order by created_at
  limit 1;

  insert into public.production_weight_receipts (
    product_config_id, lot_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
    pass_weight_kg, amount_per_pallet, weighed_by, weighed_at, barcode, status,
    metadata, request_id
  ) values (
    v_receipt.product_config_id, v_receipt.lot_id, v_receipt.gross_weight_kg,
    v_receipt.tare_weight_kg, v_receipt.net_weight_kg, v_receipt.pass_weight_kg,
    v_receipt.amount_per_pallet, v_receipt.weighed_by, clock_timestamp(),
    'IDEMPOTENCY-TEST-' || replace(v_request_id::text, '-', ''), 'recorded',
    jsonb_build_object('isTest', true), v_request_id
  );

  begin
    insert into public.production_weight_receipts (
      product_config_id, lot_id, gross_weight_kg, tare_weight_kg, net_weight_kg,
      weighed_at, barcode, status, metadata, request_id
    ) values (
      v_receipt.product_config_id, v_receipt.lot_id, v_receipt.gross_weight_kg,
      v_receipt.tare_weight_kg, v_receipt.net_weight_kg, clock_timestamp(),
      'IDEMPOTENCY-TEST-SECOND-' || replace(v_request_id::text, '-', ''),
      'recorded', jsonb_build_object('isTest', true), v_request_id
    );
  exception when unique_violation then
    v_duplicate_blocked := true;
  end;

  if not v_duplicate_blocked then
    raise exception 'duplicate receipt request_id was not blocked';
  end if;
end;
$$;

do $$
declare
  v_barcode text;
  v_active_before integer;
  v_active_after integer;
  v_failed boolean := false;
begin
  select receipts.barcode into v_barcode
  from public.production_weight_receipts receipts
  join public.production_weight_scale_products products on products.id = receipts.product_config_id
  join public.production_weight_scale_lots lots on lots.id = receipts.lot_id
  join public.products_cache cache on cache.sku_code = products.sku_code
  join public.production_departments departments on departments.id = products.department_id
  where receipts.status = 'recorded'
    and departments.code = 'KP13'
    and cache.iccat_code = '03'
    and not exists (
      select 1
      from public.production_stock_issue_items items
      join public.production_stock_issue_documents documents on documents.id = items.issue_document_id
      where items.source_receipt_id = receipts.id
        and items.status = 'confirmed'
        and documents.status = 'confirmed'
    )
  order by receipts.created_at desc
  limit 1;

  if v_barcode is null then
    raise exception 'no safe receipt candidate found for atomic batch test';
  end if;

  select count(*) into v_active_before
  from public.production_stock_issue_items items
  join public.production_stock_issue_documents documents on documents.id = items.issue_document_id
  where upper(items.barcode) = upper(v_barcode)
    and items.status = 'confirmed'
    and documents.status = 'confirmed';

  begin
    perform public.create_production_stock_issue_batch_atomic(
      array[v_barcode, 'INVALID-ATOMIC-BATCH-TEST'], 'KPF', null,
      'transaction rollback test', timezone('Asia/Bangkok', now())::date
    );
  exception when others then
    v_failed := true;
  end;

  select count(*) into v_active_after
  from public.production_stock_issue_items items
  join public.production_stock_issue_documents documents on documents.id = items.issue_document_id
  where upper(items.barcode) = upper(v_barcode)
    and items.status = 'confirmed'
    and documents.status = 'confirmed';

  if not v_failed or v_active_after <> v_active_before then
    raise exception 'batch issue was partially committed';
  end if;
end;
$$;

select 'PASS' result;
rollback;
