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

revoke execute on function public.create_production_stock_return(
  text, numeric, numeric, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.create_production_stock_return(
  text, numeric, numeric, text, uuid, text
) to service_role;
