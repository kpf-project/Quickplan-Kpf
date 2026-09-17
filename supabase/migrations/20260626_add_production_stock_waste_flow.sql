alter table public.production_stock_movements
  drop constraint if exists production_stock_movements_type_check;

alter table public.production_stock_movements
  add constraint production_stock_movements_type_check
    check (
      movement_type in (
        'opening_balance',
        'receipt_in',
        'issue_out',
        'actual_use',
        'return_in',
        'waste_out',
        'adjustment_in',
        'adjustment_out'
      )
    );

create or replace view public.production_stock_waste_progress_v as
select
  (movements.metadata ->> 'sourceIssueItemId')::uuid as source_issue_item_id,
  count(*) as waste_count,
  sum(movements.quantity_out) as wasted_quantity,
  sum(movements.weight_out_kg) as wasted_weight_kg,
  max(movements.movement_at) as last_wasted_at
from public.production_stock_movements movements
where movements.movement_type = 'waste_out'
  and movements.metadata ? 'sourceIssueItemId'
  and nullif(movements.metadata ->> 'sourceIssueItemId', '') is not null
group by (movements.metadata ->> 'sourceIssueItemId')::uuid;

create or replace view public.production_stock_issue_usage_progress_v as
select
  items.id as source_issue_item_id,
  coalesce(return_progress.return_count, 0) as return_count,
  coalesce(return_progress.returned_quantity, 0) as returned_quantity,
  coalesce(return_progress.returned_weight_kg, 0) as returned_weight_kg,
  return_progress.last_returned_at,
  coalesce(waste_progress.waste_count, 0) as waste_count,
  coalesce(waste_progress.wasted_quantity, 0) as wasted_quantity,
  coalesce(waste_progress.wasted_weight_kg, 0) as wasted_weight_kg,
  waste_progress.last_wasted_at,
  greatest(
    items.weight_kg
      - coalesce(return_progress.returned_weight_kg, 0)
      - coalesce(waste_progress.wasted_weight_kg, 0),
    0
  ) as remaining_weight_kg
from public.production_stock_issue_items items
left join public.production_stock_return_progress_v return_progress
  on return_progress.source_issue_item_id = items.id
left join public.production_stock_waste_progress_v waste_progress
  on waste_progress.source_issue_item_id = items.id;

create or replace function public.create_production_stock_return(
  p_source_barcode text,
  p_net_weight_kg numeric,
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
  v_net_weight_kg numeric(12, 3) := round(coalesce(p_net_weight_kg, 0)::numeric, 3);
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
begin
  if v_source_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณาระบุบาร์โค้ดที่ต้องการคืน';
  end if;

  if v_net_weight_kg <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'น้ำหนักที่คืนต้องมากกว่า 0';
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
        'น้ำหนักที่คืน %s Kg มากกว่าน้ำหนักคงเหลือที่บันทึกได้ %s Kg',
        trim(to_char(v_net_weight_kg, 'FM999999990.000')),
        trim(to_char(v_available_weight_kg, 'FM999999990.000'))
      );
  end if;

  v_return_sequence := v_issue.return_count + 1;
  v_return_barcode := v_source_barcode || 'X' || lpad(v_return_sequence::text, 2, '0');

  v_bangkok_hour := extract(hour from v_bangkok_now);
  if v_bangkok_hour >= 7 and v_bangkok_hour < 19 then
    v_shift := '1';
    v_production_date := v_bangkok_now::date;
  else
    v_shift := '2';
    if v_bangkok_hour < 7 then
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
    v_net_weight_kg,
    0,
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
    'netWeightKg', v_return_receipt.net_weight_kg,
    'weightInKg', v_return_receipt.net_weight_kg,
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
  if v_bangkok_hour >= 7 and v_bangkok_hour < 19 then
    v_shift := '1';
    v_production_date := v_bangkok_now::date;
  else
    v_shift := '2';
    if v_bangkok_hour < 7 then
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

notify pgrst, 'reload schema';
