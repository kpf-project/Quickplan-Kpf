-- Drop the old function to avoid overloading
drop function if exists public.create_production_prison_issue(text, uuid, text);

-- Recreate function with p_issued_at parameter
create or replace function public.create_production_prison_issue(
  p_barcode text,
  p_actor_user_id uuid default null,
  p_remark text default null,
  p_issued_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_issued_at, timezone('utc', now()));
  v_issue_date date := (timezone('Asia/Bangkok', v_now))::date;
  v_barcode text := upper(trim(coalesce(p_barcode, '')));
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_issue_no text := public.generate_production_stock_reference_no('PIS');
  v_document_id uuid;
  v_issue_item_id uuid;
  v_inbound record;
begin
  if v_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิกเรือนจำ';
  end if;

  select
    inbound.inbound_document_id,
    inbound.inbound_item_id,
    inbound.inbound_no,
    inbound.department_id,
    inbound.department_code,
    inbound.barcode,
    inbound.product_code,
    inbound.product_name_snapshot,
    inbound.category_code,
    inbound.lot_no,
    inbound.uom_name,
    inbound.quantity,
    inbound.weight_kg,
    inbound.prison_issue_item_id
  into v_inbound
  from public.production_prison_inbound_report_lines_v inbound
  where upper(coalesce(inbound.barcode, '')) = v_barcode
    and inbound.inbound_document_status = 'confirmed'
    and inbound.inbound_item_status = 'confirmed'
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบบาร์โค้ดรับเข้าเรือนจำ หรือรายการนี้ไม่พร้อมเบิก';
  end if;

  if v_inbound.prison_issue_item_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'บาร์โค้ดนี้ถูกเบิกออกเรือนจำแล้ว';
  end if;

  insert into public.production_prison_issue_documents (
    prison_issue_no,
    department_id,
    department_code,
    issue_date,
    issued_at,
    status,
    remark,
    metadata,
    created_by
  )
  values (
    v_issue_no,
    v_inbound.department_id,
    v_inbound.department_code,
    v_issue_date,
    v_now,
    'confirmed',
    v_remark,
    jsonb_build_object(
      'createdFrom', 'barcode_scan',
      'barcode', v_inbound.barcode,
      'sourceInboundNo', v_inbound.inbound_no
    ),
    p_actor_user_id
  )
  returning id into v_document_id;

  begin
    insert into public.production_prison_issue_items (
      prison_issue_document_id,
      source_issue_item_id,
      source_issue_document_id,
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
      v_inbound.inbound_item_id,
      v_inbound.inbound_document_id,
      (
        select source_receipt_id
        from public.production_stock_issue_items
        where id = v_inbound.inbound_item_id
      ),
      v_inbound.barcode,
      v_inbound.product_code,
      v_inbound.product_name_snapshot,
      v_inbound.category_code,
      v_inbound.lot_no,
      v_inbound.uom_name,
      v_inbound.quantity,
      v_inbound.weight_kg,
      v_now,
      'confirmed',
      jsonb_build_object(
        'sourceInboundNo', v_inbound.inbound_no,
        'sourceIssueItemId', v_inbound.inbound_item_id
      ),
      p_actor_user_id
    )
    returning id into v_issue_item_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'บาร์โค้ดนี้ถูกเบิกออกเรือนจำแล้ว';
  end;

  return jsonb_build_object(
    'prisonIssueDocumentId', v_document_id,
    'prisonIssueItemId', v_issue_item_id,
    'prisonIssueNo', v_issue_no,
    'issueDate', v_issue_date,
    'issuedAt', v_now,
    'barcode', v_inbound.barcode,
    'productCode', v_inbound.product_code,
    'productName', v_inbound.product_name_snapshot,
    'lotNo', v_inbound.lot_no,
    'quantity', v_inbound.quantity,
    'weightKg', v_inbound.weight_kg
  );
end;
$$;
