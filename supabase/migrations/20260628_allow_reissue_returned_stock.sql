drop index if exists public.production_stock_issue_items_active_receipt_uidx;

create or replace function public.create_production_stock_issue(
  p_barcode text,
  p_issue_type text,
  p_actor_user_id uuid default null,
  p_remark text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_issue_date date := (timezone('Asia/Bangkok', v_now))::date;
  v_issue_type text := upper(trim(coalesce(p_issue_type, '')));
  v_barcode text := upper(trim(coalesce(p_barcode, '')));
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_issue_no text := public.generate_production_stock_reference_no('ISS');
  v_movement_no text := public.generate_production_stock_reference_no('MVISS');
  v_document_id uuid;
  v_issue_item_id uuid;
  v_receipt record;
  v_issued_weight_kg numeric(14, 3) := 0;
  v_returned_weight_kg numeric(14, 3) := 0;
  v_restored_weight_kg numeric(14, 3) := 0;
  v_available_weight_kg numeric(14, 3) := 0;
  v_issue_weight_kg numeric(14, 3) := 0;
begin
  if v_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิก';
  end if;

  if v_issue_type not in ('KPF', 'PB', 'PRISON') then
    raise exception using
      errcode = 'P0001',
      message = 'ประเภทการเบิกไม่ถูกต้อง';
  end if;

  select
    receipts.id as receipt_id,
    receipts.barcode,
    receipts.net_weight_kg,
    receipts.weighed_at,
    scale_products.department_id,
    departments.code as department_code,
    scale_products.sku_code as product_code,
    products.sku_name as product_name,
    products.uom_name,
    products.iccat_code as category_code,
    lots.lot_code as lot_no
  into v_receipt
  from public.production_weight_receipts receipts
  join public.production_weight_scale_products scale_products
    on scale_products.id = receipts.product_config_id
  join public.production_weight_scale_lots lots
    on lots.id = receipts.lot_id
  join public.products_cache products
    on products.sku_code = scale_products.sku_code
  join public.production_departments departments
    on departments.id = scale_products.department_id
  where upper(coalesce(receipts.barcode, '')) = v_barcode
    and receipts.status = 'recorded'
    and lower(coalesce(receipts.metadata ->> 'isReturn', 'false')) not in ('true', '1', 'yes')
    and departments.code = 'DEP-BIS'
    and products.iccat_code = '03'
  limit 1
  for update of receipts;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบบาร์โค้ดสำหรับเบิก หรือบาร์โค้ดนี้อยู่นอกขอบเขต DEP-BIS / หมวด 03';
  end if;

  select
    coalesce(sum(case when movements.movement_type = 'issue_out' then movements.weight_out_kg else 0 end), 0),
    coalesce(sum(case when movements.movement_type = 'return_in' then movements.weight_in_kg else 0 end), 0),
    coalesce(sum(
      case
        when movements.movement_type = 'adjustment_in'
          and movements.metadata ->> 'reversedMovementType' = 'issue_out'
          then movements.weight_in_kg
        else 0
      end
    ), 0)
  into v_issued_weight_kg, v_returned_weight_kg, v_restored_weight_kg
  from public.production_stock_movements movements
  where movements.metadata ->> 'sourceReceiptId' = v_receipt.receipt_id::text
    and movements.movement_type in ('issue_out', 'return_in', 'adjustment_in');

  v_available_weight_kg := greatest(
    round(
      coalesce(v_receipt.net_weight_kg, 0)
      - coalesce(v_issued_weight_kg, 0)
      + coalesce(v_returned_weight_kg, 0)
      + coalesce(v_restored_weight_kg, 0),
      3
    ),
    0
  );

  if v_available_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'บาร์โค้ดนี้เบิกครบแล้ว หากมีการชั่งคืน ระบบจะแสดงยอดคืนให้เบิกต่ออัตโนมัติ';
  end if;

  v_issue_weight_kg := v_available_weight_kg;

  insert into public.production_stock_issue_documents (
    issue_no,
    department_id,
    department_code,
    issue_type,
    issue_date,
    issued_at,
    status,
    remark,
    metadata,
    created_by
  )
  values (
    v_issue_no,
    v_receipt.department_id,
    v_receipt.department_code,
    v_issue_type,
    v_issue_date,
    v_now,
    'confirmed',
    v_remark,
    jsonb_build_object(
      'createdFrom', 'barcode_scan',
      'barcode', v_receipt.barcode,
      'sourceReceiptId', v_receipt.receipt_id,
      'availableWeightBeforeKg', v_available_weight_kg
    ),
    p_actor_user_id
  )
  returning id into v_document_id;

  insert into public.production_stock_issue_items (
    issue_document_id,
    source_receipt_id,
    barcode,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    uom_name,
    quantity,
    weight_kg,
    issued_at,
    status,
    metadata,
    created_by
  )
  values (
    v_document_id,
    v_receipt.receipt_id,
    v_receipt.barcode,
    v_receipt.product_code,
    v_receipt.product_name,
    v_receipt.category_code,
    v_receipt.lot_no,
    v_receipt.uom_name,
    1,
    v_issue_weight_kg,
    v_now,
    'confirmed',
    jsonb_build_object(
      'issueType', v_issue_type,
      'receiptWeighedAt', v_receipt.weighed_at,
      'sourceReceiptWeightKg', v_receipt.net_weight_kg,
      'issuedWeightBeforeKg', v_issued_weight_kg,
      'returnedWeightKg', v_returned_weight_kg,
      'restoredWeightKg', v_restored_weight_kg,
      'availableWeightBeforeKg', v_available_weight_kg,
      'availableWeightAfterKg', 0
    ),
    p_actor_user_id
  )
  returning id into v_issue_item_id;

  insert into public.production_stock_movements (
    movement_no,
    movement_type,
    movement_date,
    movement_at,
    department_id,
    department_code,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    uom_name,
    quantity_out,
    weight_out_kg,
    source_document_type,
    source_document_no,
    reference_type,
    reference_no,
    remark,
    metadata,
    created_by
  )
  values (
    v_movement_no,
    'issue_out',
    v_issue_date,
    v_now,
    v_receipt.department_id,
    v_receipt.department_code,
    v_receipt.product_code,
    v_receipt.product_name,
    v_receipt.category_code,
    v_receipt.lot_no,
    v_receipt.uom_name,
    1,
    v_issue_weight_kg,
    'stock_issue',
    v_issue_no,
    'weight_receipt',
    v_receipt.barcode,
    v_remark,
    jsonb_build_object(
      'issueDocumentId', v_document_id,
      'issueItemId', v_issue_item_id,
      'issueType', v_issue_type,
      'barcode', v_receipt.barcode,
      'sourceReceiptId', v_receipt.receipt_id,
      'sourceReceiptWeightKg', v_receipt.net_weight_kg,
      'issuedWeightBeforeKg', v_issued_weight_kg,
      'returnedWeightKg', v_returned_weight_kg,
      'restoredWeightKg', v_restored_weight_kg,
      'availableWeightBeforeKg', v_available_weight_kg,
      'availableWeightAfterKg', 0
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'issueDocumentId', v_document_id,
    'issueItemId', v_issue_item_id,
    'issueNo', v_issue_no,
    'issueType', v_issue_type,
    'issueDate', v_issue_date,
    'issuedAt', v_now,
    'barcode', v_receipt.barcode,
    'productCode', v_receipt.product_code,
    'productName', v_receipt.product_name,
    'lotNo', v_receipt.lot_no,
    'quantity', 1,
    'weightKg', v_issue_weight_kg,
    'availableWeightBeforeKg', v_available_weight_kg,
    'availableWeightAfterKg', 0
  );
end;
$$;
