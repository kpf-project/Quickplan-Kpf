-- Update shift boundaries and production date calculations for stock return, waste, and issue functions.
-- Shift 1: 06:01 - 19:00 (361 to 1140 minutes)
-- Shift 2: 19:01 - 06:00 (1141 to 360 minutes next day)

-- 1. Redefine create_production_stock_return
create or replace function public.create_production_stock_return(
  p_source_barcode text,
  p_gross_weight_kg numeric,
  p_tare_weight_kg numeric,
  p_tare_source text default 'source_receipt',
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
  v_source_barcode text := upper(trim(coalesce(p_source_barcode, '')));
  v_gross_weight_kg numeric(12, 3) := round(coalesce(p_gross_weight_kg, 0)::numeric, 3);
  v_tare_weight_kg numeric(12, 3) := round(coalesce(p_tare_weight_kg, 0)::numeric, 3);
  v_net_weight_kg numeric(12, 3) := round(v_gross_weight_kg - v_tare_weight_kg, 3);
  v_tare_source text := case
    when lower(trim(coalesce(p_tare_source, ''))) = 'manual' then 'manual'
    else 'source_receipt'
  end;
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_return_barcode text;
  v_movement_no text := public.generate_production_stock_reference_no('MVRET');
  v_production_date date;
  v_shift text;
  v_issue record;
  v_return_receipt record;
  v_available_weight_kg numeric(12, 3);
  v_return_sequence integer;
  v_bangkok_now timestamp without time zone := timezone('Asia/Bangkok', v_now);
  v_bangkok_hour integer;
  v_bangkok_minute integer;
  v_time_in_minutes integer;
begin
  if v_source_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณาระบุบาร์โค้ดที่ต้องการคืน';
  end if;

  if v_gross_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'น้ำหนักรวมต้องมากกว่า 0';
  end if;

  if v_tare_weight_kg < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'น้ำหนักภาชนะต้องไม่ติดลบ';
  end if;

  if v_tare_weight_kg >= v_gross_weight_kg then
    raise exception using
      errcode = 'P0001',
      message = 'น้ำหนักภาชนะต้องน้อยกว่าน้ำหนักรวม';
  end if;

  select
    items.id as issue_item_id,
    documents.id as issue_document_id,
    items.source_receipt_id,
    items.barcode,
    items.product_code,
    items.product_name_snapshot,
    items.category_code,
    items.lot_no,
    items.uom_name,
    items.quantity as issued_quantity,
    items.weight_kg as issued_weight_kg,
    documents.department_id,
    documents.department_code,
    receipts.product_config_id,
    receipts.lot_id,
    receipts.pass_weight_kg,
    receipts.amount_per_pallet,
    coalesce(progress.return_count, 0) as return_count,
    coalesce(progress.returned_weight_kg, 0) as returned_weight_kg,
    coalesce(progress.wasted_weight_kg, 0) as wasted_weight_kg,
    coalesce(progress.remaining_weight_kg, items.weight_kg) as remaining_weight_kg
  into v_issue
  from public.production_stock_issue_items items
  join public.production_stock_issue_documents documents
    on documents.id = items.issue_document_id
  join public.production_weight_receipts receipts
    on receipts.id = items.source_receipt_id
  left join public.production_stock_issue_usage_progress_v progress
    on progress.source_issue_item_id = items.id
  where upper(coalesce(items.barcode, '')) = v_source_barcode
    and items.status = 'confirmed'
    and documents.status = 'confirmed'
  order by items.issued_at desc
  limit 1
  for update of items, documents;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = format('ไม่พบบาร์โค้ด %s สำหรับคืนสินค้า หรือรายการนี้ถูกยกเลิกไปแล้ว', v_source_barcode);
  end if;

  v_available_weight_kg := greatest(v_issue.remaining_weight_kg, 0);

  if v_available_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = format('บาร์โค้ด %s ถูกปิดยอดครบแล้ว ไม่สามารถคืนเพิ่มได้', v_source_barcode);
  end if;

  if v_net_weight_kg > v_available_weight_kg then
    raise exception using
      errcode = 'P0001',
      message = format(
        'น้ำหนักสุทธิที่คืน %s Kg มากกว่าน้ำหนักคงเหลือที่บันทึกได้ %s Kg',
        trim(to_char(v_net_weight_kg, 'FM999999990.000')),
        trim(to_char(v_available_weight_kg, 'FM999999990.000'))
      );
  end if;

  v_return_sequence := v_issue.return_count + 1;
  v_return_barcode := v_source_barcode || 'X' || lpad(v_return_sequence::text, 2, '0');

  v_bangkok_hour := extract(hour from v_bangkok_now);
  v_bangkok_minute := extract(minute from v_bangkok_now);
  v_time_in_minutes := v_bangkok_hour * 60 + v_bangkok_minute;

  if v_time_in_minutes >= 361 and v_time_in_minutes <= 1140 then
    v_shift := '1';
    v_production_date := v_bangkok_now::date;
  else
    v_shift := '2';
    if v_time_in_minutes <= 360 then
      v_production_date := (v_bangkok_now::date - interval '1 day')::date;
    else
      v_production_date := v_bangkok_now::date;
    end if;
  end if;

  insert into public.production_weight_receipts (
    product_config_id,
    lot_id,
    gross_weight_kg,
    tare_weight_kg,
    net_weight_kg,
    pass_weight_kg,
    amount_per_pallet,
    barcode,
    weighed_at,
    weighed_by,
    status,
    metadata
  )
  values (
    v_issue.product_config_id,
    v_issue.lot_id,
    v_gross_weight_kg,
    v_tare_weight_kg,
    v_net_weight_kg,
    v_issue.pass_weight_kg,
    v_issue.amount_per_pallet,
    v_return_barcode,
    v_now,
    p_actor_user_id,
    'recorded',
    jsonb_build_object(
      'isReturn', true,
      'sourceBarcode', v_issue.barcode,
      'sourceIssueItemId', v_issue.issue_item_id,
      'sourceIssueDocumentId', v_issue.issue_document_id,
      'sourceReceiptId', v_issue.source_receipt_id,
      'returnSequence', v_return_sequence,
      'grossWeightKg', v_gross_weight_kg,
      'tareWeightKg', v_tare_weight_kg,
      'tareSource', v_tare_source,
      'returnedWeightBeforeKg', v_issue.returned_weight_kg,
      'returnedWeightAfterKg', v_issue.returned_weight_kg + v_net_weight_kg,
      'wastedWeightKg', v_issue.wasted_weight_kg,
      'remainingWeightKg', greatest(v_available_weight_kg - v_net_weight_kg, 0),
      'productionDate', v_production_date,
      'shift', v_shift
    )
  )
  returning
    id,
    barcode,
    gross_weight_kg,
    tare_weight_kg,
    net_weight_kg,
    weighed_at
  into v_return_receipt;

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
    quantity_in,
    weight_in_kg,
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
    'return_in',
    v_production_date,
    v_now,
    v_issue.department_id,
    v_issue.department_code,
    v_issue.product_code,
    v_issue.product_name_snapshot,
    v_issue.category_code,
    v_issue.lot_no,
    v_issue.uom_name,
    1,
    v_net_weight_kg,
    'stock_return',
    v_return_receipt.barcode,
    'weight_receipt',
    v_return_receipt.barcode,
    coalesce(v_remark, 'ชั่งคืนผลิตภัณฑ์'),
    jsonb_build_object(
      'sourceBarcode', v_issue.barcode,
      'sourceIssueItemId', v_issue.issue_item_id,
      'sourceIssueDocumentId', v_issue.issue_document_id,
      'sourceReceiptId', v_issue.source_receipt_id,
      'returnReceiptId', v_return_receipt.id,
      'returnSequence', v_return_sequence,
      'grossWeightKg', v_gross_weight_kg,
      'tareWeightKg', v_tare_weight_kg,
      'tareSource', v_tare_source,
      'returnedWeightBeforeKg', v_issue.returned_weight_kg,
      'returnedWeightAfterKg', v_issue.returned_weight_kg + v_net_weight_kg,
      'wastedWeightKg', v_issue.wasted_weight_kg,
      'remainingWeightKg', greatest(v_available_weight_kg - v_net_weight_kg, 0),
      'productionDate', v_production_date,
      'shift', v_shift
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'id', v_return_receipt.id,
    'barcode', v_return_receipt.barcode,
    'grossWeightKg', v_return_receipt.gross_weight_kg,
    'tareWeightKg', v_return_receipt.tare_weight_kg,
    'netWeightKg', v_return_receipt.net_weight_kg,
    'weightInKg', v_return_receipt.net_weight_kg,
    'tareSource', v_tare_source,
    'returnedAt', v_return_receipt.weighed_at,
    'movementNo', v_movement_no,
    'productCode', v_issue.product_code,
    'productName', v_issue.product_name_snapshot,
    'lotNo', v_issue.lot_no,
    'sourceBarcode', v_issue.barcode,
    'returnedWeightKg', v_issue.returned_weight_kg + v_net_weight_kg,
    'wastedWeightKg', v_issue.wasted_weight_kg,
    'remainingWeightKg', greatest(v_available_weight_kg - v_net_weight_kg, 0),
    'returnSequence', v_return_sequence
  );
end;
$$;

-- 2. Redefine create_production_stock_waste
create or replace function public.create_production_stock_waste(
  p_source_barcode text,
  p_waste_weight_kg numeric,
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
  v_source_barcode text := upper(trim(coalesce(p_source_barcode, '')));
  v_waste_weight_kg numeric(12, 3) := round(coalesce(p_waste_weight_kg, 0)::numeric, 3);
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_movement_no text := public.generate_production_stock_reference_no('MVWST');
  v_production_date date;
  v_shift text;
  v_issue record;
  v_available_weight_kg numeric(12, 3);
  v_waste_sequence integer;
  v_bangkok_now timestamp without time zone := timezone('Asia/Bangkok', v_now);
  v_bangkok_hour integer;
  v_bangkok_minute integer;
  v_time_in_minutes integer;
begin
  if v_source_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณาระบุบาร์โค้ดที่ต้องการบันทึกของเสีย';
  end if;

  if v_waste_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'น้ำหนักของเสียต้องมากกว่า 0';
  end if;

  select
    items.id as issue_item_id,
    documents.id as issue_document_id,
    items.source_receipt_id,
    items.barcode,
    items.product_code,
    items.product_name_snapshot,
    items.category_code,
    items.lot_no,
    items.uom_name,
    items.quantity as issued_quantity,
    items.weight_kg as issued_weight_kg,
    documents.department_id,
    documents.department_code,
    coalesce(progress.returned_weight_kg, 0) as returned_weight_kg,
    coalesce(progress.waste_count, 0) as waste_count,
    coalesce(progress.wasted_weight_kg, 0) as wasted_weight_kg,
    coalesce(progress.remaining_weight_kg, items.weight_kg) as remaining_weight_kg
  into v_issue
  from public.production_stock_issue_items items
  join public.production_stock_issue_documents documents
    on documents.id = items.issue_document_id
  left join public.production_stock_issue_usage_progress_v progress
    on progress.source_issue_item_id = items.id
  where upper(coalesce(items.barcode, '')) = v_source_barcode
    and items.status = 'confirmed'
    and documents.status = 'confirmed'
  order by items.issued_at desc
  limit 1
  for update of items, documents;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = format('ไม่พบบาร์โค้ด %s สำหรับบันทึกของเสีย หรือรายการนี้ถูกยกเลิกไปแล้ว', v_source_barcode);
  end if;

  v_available_weight_kg := greatest(v_issue.remaining_weight_kg, 0);

  if v_available_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = format('บาร์โค้ด %s ถูกปิดยอดครบแล้ว ไม่สามารถบันทึกของเสียเพิ่มได้', v_source_barcode);
  end if;

  if v_waste_weight_kg > v_available_weight_kg then
    raise exception using
      errcode = 'P0001',
      message = format(
        'น้ำหนักของเสีย %s Kg มากกว่าน้ำหนักคงเหลือที่บันทึกได้ %s Kg',
        trim(to_char(v_waste_weight_kg, 'FM999999990.000')),
        trim(to_char(v_available_weight_kg, 'FM999999990.000'))
      );
  end if;

  v_waste_sequence := v_issue.waste_count + 1;

  v_bangkok_hour := extract(hour from v_bangkok_now);
  v_bangkok_minute := extract(minute from v_bangkok_now);
  v_time_in_minutes := v_bangkok_hour * 60 + v_bangkok_minute;

  if v_time_in_minutes >= 361 and v_time_in_minutes <= 1140 then
    v_shift := '1';
    v_production_date := v_bangkok_now::date;
  else
    v_shift := '2';
    if v_time_in_minutes <= 360 then
      v_production_date := (v_bangkok_now::date - interval '1 day')::date;
    else
      v_production_date := v_bangkok_now::date;
    end if;
  end if;

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
    'waste_out',
    v_production_date,
    v_now,
    v_issue.department_id,
    v_issue.department_code,
    v_issue.product_code,
    v_issue.product_name_snapshot,
    v_issue.category_code,
    v_issue.lot_no,
    v_issue.uom_name,
    1,
    v_waste_weight_kg,
    'stock_waste',
    v_movement_no,
    'stock_issue_item',
    v_issue.issue_item_id::text,
    coalesce(v_remark, 'ชั่งของเสียผลิตภัณฑ์'),
    jsonb_build_object(
      'sourceBarcode', v_issue.barcode,
      'sourceIssueItemId', v_issue.issue_item_id,
      'sourceIssueDocumentId', v_issue.issue_document_id,
      'sourceReceiptId', v_issue.source_receipt_id,
      'wasteSequence', v_waste_sequence,
      'returnedWeightKg', v_issue.returned_weight_kg,
      'wastedWeightBeforeKg', v_issue.wasted_weight_kg,
      'wastedWeightAfterKg', v_issue.wasted_weight_kg + v_waste_weight_kg,
      'remainingWeightKg', greatest(v_available_weight_kg - v_waste_weight_kg, 0),
      'productionDate', v_production_date,
      'shift', v_shift
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'id', v_movement_no,
    'movementNo', v_movement_no,
    'barcode', v_movement_no,
    'sourceBarcode', v_issue.barcode,
    'weightOutKg', v_waste_weight_kg,
    'netWeightKg', v_waste_weight_kg,
    'wastedAt', v_now,
    'productCode', v_issue.product_code,
    'productName', v_issue.product_name_snapshot,
    'lotNo', v_issue.lot_no,
    'returnedWeightKg', v_issue.returned_weight_kg,
    'wastedWeightKg', v_issue.wasted_weight_kg + v_waste_weight_kg,
    'remainingWeightKg', greatest(v_available_weight_kg - v_waste_weight_kg, 0),
    'wasteSequence', v_waste_sequence
  );
end;
$$;

-- 3. Redefine create_production_stock_issue to use the same production date shift logic
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
  v_issue_date date;
  v_issue_type text := upper(trim(coalesce(p_issue_type, '')));
  v_barcode text := upper(trim(coalesce(p_barcode, '')));
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_issue_no text := public.generate_production_stock_reference_no('ISS');
  v_movement_no text := public.generate_production_stock_reference_no('MVISS');
  v_document_id uuid;
  v_issue_item_id uuid;
  v_receipt record;
  v_is_return_receipt boolean := false;
  v_root_receipt_id text;
  v_has_active_issue boolean := false;
  v_issued_weight_kg numeric(14, 3) := 0;
  v_restored_weight_kg numeric(14, 3) := 0;
  v_available_weight_kg numeric(14, 3) := 0;
  v_issue_weight_kg numeric(14, 3) := 0;
  v_bangkok_now timestamp without time zone := timezone('Asia/Bangkok', v_now);
  v_bangkok_hour integer;
  v_bangkok_minute integer;
  v_time_in_minutes integer;
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
    receipts.metadata as receipt_metadata,
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
    and departments.code = 'KP13'
    and products.iccat_code = '03'
  limit 1
  for update of receipts;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบบาร์โค้ดสำหรับเบิก หรือบาร์โค้ดนี้อยู่นอกขอบเขต KP13 / หมวด 03';
  end if;

  v_is_return_receipt := lower(
    coalesce(v_receipt.receipt_metadata ->> 'isReturn', 'false')
  ) in ('true', '1', 'yes');
  v_root_receipt_id := case
    when v_is_return_receipt then coalesce(
      nullif(v_receipt.receipt_metadata ->> 'sourceReceiptId', ''),
      v_receipt.receipt_id::text
    )
    else v_receipt.receipt_id::text
  end;

  if v_is_return_receipt then
    select exists (
      select 1
      from public.production_stock_issue_items items
      join public.production_stock_issue_documents documents
        on documents.id = items.issue_document_id
      where items.source_receipt_id = v_receipt.receipt_id
        and items.status = 'confirmed'
        and documents.status = 'confirmed'
    )
    into v_has_active_issue;

    if v_has_active_issue then
      raise exception using
        errcode = 'P0001',
        message = 'บาร์โค้ดใบชั่งคืนนี้ถูกเบิกไปแล้ว ไม่สามารถเบิกซ้ำได้';
    end if;

    v_issue_weight_kg := round(coalesce(v_receipt.net_weight_kg, 0), 3);
    v_available_weight_kg := v_issue_weight_kg;
  else
    select
      coalesce(sum(
        case
          when movements.movement_type = 'issue_out'
            then movements.weight_out_kg
          else 0
        end
      ), 0),
      coalesce(sum(
        case
          when movements.movement_type = 'adjustment_in'
            and movements.metadata ->> 'reversedMovementType' = 'issue_out'
            then movements.weight_in_kg
          else 0
        end
      ), 0)
    into v_issued_weight_kg, v_restored_weight_kg
    from public.production_stock_movements movements
    where movements.metadata ->> 'sourceReceiptId' = v_receipt.receipt_id::text
      and movements.movement_type in ('issue_out', 'adjustment_in');

    v_available_weight_kg := greatest(
      round(
        coalesce(v_receipt.net_weight_kg, 0)
          - coalesce(v_issued_weight_kg, 0)
          + coalesce(v_restored_weight_kg, 0),
        3
      ),
      0
    );
    v_issue_weight_kg := v_available_weight_kg;
  end if;

  if v_issue_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = case
        when v_is_return_receipt
          then 'ใบชั่งคืนนี้ไม่มีน้ำหนักสุทธิที่สามารถเบิกได้'
        else 'บาร์โค้ดนี้เบิกครบแล้ว หากมีการชั่งคืน กรุณาเบิกด้วยบาร์โค้ดใบชั่งคืน'
      end;
  end if;

  -- Calculate issue_date based on shift boundaries
  v_bangkok_hour := extract(hour from v_bangkok_now);
  v_bangkok_minute := extract(minute from v_bangkok_now);
  v_time_in_minutes := v_bangkok_hour * 60 + v_bangkok_minute;

  if v_time_in_minutes >= 361 and v_time_in_minutes <= 1140 then
    v_issue_date := v_bangkok_now::date;
  else
    if v_time_in_minutes <= 360 then
      v_issue_date := (v_bangkok_now::date - interval '1 day')::date;
    else
      v_issue_date := v_bangkok_now::date;
    end if;
  end if;

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
      'rootSourceReceiptId', v_root_receipt_id,
      'isReturnReceipt', v_is_return_receipt,
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
      'sourceReceiptId', v_receipt.receipt_id,
      'rootSourceReceiptId', v_root_receipt_id,
      'isReturnReceipt', v_is_return_receipt,
      'issuedWeightBeforeKg', v_issued_weight_kg,
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
      'rootSourceReceiptId', v_root_receipt_id,
      'isReturnReceipt', v_is_return_receipt,
      'sourceReceiptWeightKg', v_receipt.net_weight_kg,
      'issuedWeightBeforeKg', v_issued_weight_kg,
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
    'availableWeightAfterKg', 0,
    'sourceReceiptId', v_receipt.receipt_id,
    'rootSourceReceiptId', v_root_receipt_id,
    'isReturnReceipt', v_is_return_receipt
  );
end;
$$;

-- Grant permissions
revoke execute on function public.create_production_stock_return(text, numeric, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_production_stock_return(text, numeric, numeric, text, uuid, text) to service_role;

revoke execute on function public.create_production_stock_waste(text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.create_production_stock_waste(text, numeric, uuid, text) to service_role;

revoke all on function public.create_production_stock_issue(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_production_stock_issue(text, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
