-- Complete the piece-rate label stock lifecycle with an immutable stock ledger.
-- Every operation is recorded as a new movement; cancellation never deletes history.

alter table public.production_piece_rate_logs
  add column if not exists stock_movement_id uuid
    references public.production_stock_movements(id) on delete set null;

alter table public.production_piece_rate_stock_issues
  add column if not exists product_sku_code text;

alter table public.production_piece_rate_stock_returns
  add column if not exists product_sku_code text;

create index if not exists production_piece_rate_logs_stock_movement_idx
  on public.production_piece_rate_logs (stock_movement_id)
  where stock_movement_id is not null;

create index if not exists production_piece_rate_stock_issues_movement_idx
  on public.production_piece_rate_stock_issues (stock_movement_id)
  where stock_movement_id is not null;

create index if not exists production_piece_rate_stock_returns_movement_idx
  on public.production_piece_rate_stock_returns (stock_movement_id)
  where stock_movement_id is not null;

create unique index if not exists production_stock_movements_piece_rate_source_uidx
  on public.production_stock_movements (source_document_type, source_document_no)
  where source_document_type in (
    'piece_rate_weigh',
    'piece_rate_weigh_void',
    'piece_rate_issue',
    'piece_rate_issue_void',
    'piece_rate_return'
  );

create or replace function public.resolve_piece_rate_stock_department(p_product_sku_code text)
returns table(department_id uuid, department_code text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select departments.id, departments.code
  from public.production_department_products mappings
  join public.production_departments departments
    on departments.id = mappings.department_id
  where upper(trim(mappings.sku_code)) = upper(trim(p_product_sku_code))
    and departments.deleted_at is null
    and departments.is_active = true
  order by mappings.is_owner desc, mappings.id asc
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = format(
        'ยังไม่ได้ผูกสินค้า %s กับแผนกเจ้าของสต็อก กรุณาตั้งค่าที่หน้ากำหนดสินค้าแผนก',
        coalesce(nullif(trim(p_product_sku_code), ''), '-')
      );
  end if;
end;
$$;

revoke all on function public.resolve_piece_rate_stock_department(text) from public, anon, authenticated;
grant execute on function public.resolve_piece_rate_stock_department(text) to service_role;

create or replace function public.ensure_piece_rate_receipt_movement(p_log_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.production_piece_rate_logs%rowtype;
  v_department record;
  v_product_sku text;
  v_weight numeric(14, 3);
  v_movement_id uuid;
  v_movement_at timestamptz;
begin
  select * into v_log
  from public.production_piece_rate_logs
  where id = p_log_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบเอกสารชั่งเข้า';
  end if;

  if v_log.stock_movement_id is not null then
    return v_log.stock_movement_id;
  end if;

  select movements.id into v_movement_id
  from public.production_stock_movements movements
  where movements.source_document_type = 'piece_rate_weigh'
    and movements.source_document_no = v_log.doc_no
  limit 1;

  if v_movement_id is not null then
    update public.production_piece_rate_logs
    set stock_movement_id = v_movement_id
    where id = v_log.id;
    return v_movement_id;
  end if;

  v_product_sku := coalesce(
    nullif(trim(v_log.product_sku_code_snapshot), ''),
    nullif(trim(v_log.product_code_snapshot), '')
  );
  v_weight := round(coalesce(v_log.normalized_kg_amount_snapshot, v_log.input_value, 0)::numeric, 3);
  v_movement_at := coalesce(v_log.actual_weighed_at, v_log.logged_at, timezone('utc', now()));

  if v_product_sku is null or v_weight <= 0 or nullif(trim(v_log.lot_no), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'เอกสารชั่งเข้าขาด SKU, LOT หรือน้ำหนัก จึงลงสต็อกไม่ได้';
  end if;

  select * into v_department
  from public.resolve_piece_rate_stock_department(v_product_sku);

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
  ) values (
    public.generate_production_stock_reference_no('MVPRIN'),
    'receipt_in',
    (v_movement_at at time zone 'Asia/Bangkok')::date,
    v_movement_at,
    v_department.department_id,
    v_department.department_code,
    v_product_sku,
    coalesce(nullif(trim(v_log.product_name_snapshot), ''), v_product_sku),
    '03',
    trim(v_log.lot_no),
    v_log.product_unit_snapshot,
    1,
    v_weight,
    'piece_rate_weigh',
    v_log.doc_no,
    'piece_rate_log',
    v_log.doc_no,
    'ชั่งเข้าจากระบบบันทึกเนื้อขนมป้ายแยม',
    jsonb_build_object(
      'pieceRateLogId', v_log.id,
      'barcode', v_log.doc_no,
      'goodsCode', v_log.product_goods_code_snapshot,
      'employeeCode', v_log.employee_code,
      'lotNo', v_log.lot_no
    ),
    v_log.operator_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_logs
  set stock_movement_id = v_movement_id
  where id = v_log.id;

  return v_movement_id;
end;
$$;

revoke all on function public.ensure_piece_rate_receipt_movement(uuid) from public, anon, authenticated;
grant execute on function public.ensure_piece_rate_receipt_movement(uuid) to service_role;

create or replace function public.sync_piece_rate_log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.production_stock_movements%rowtype;
  v_void_movement_id uuid;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.doc_status, 'active') = 'active' then
      perform public.ensure_piece_rate_receipt_movement(new.id);
    end if;
    return new;
  end if;

  if coalesce(old.doc_status, 'active') = 'active'
     and coalesce(new.doc_status, 'active') in ('cancelled', 'replaced') then
    perform public.ensure_piece_rate_receipt_movement(new.id);

    select * into v_receipt
    from public.production_stock_movements
    where source_document_type = 'piece_rate_weigh'
      and source_document_no = new.doc_no
    limit 1;

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
    ) values (
      public.generate_production_stock_reference_no('MVPRVOID'),
      'adjustment_out',
      (timezone('Asia/Bangkok', now()))::date,
      timezone('utc', now()),
      v_receipt.department_id,
      v_receipt.department_code,
      v_receipt.product_code,
      v_receipt.product_name_snapshot,
      v_receipt.category_code,
      v_receipt.lot_no,
      v_receipt.uom_name,
      v_receipt.quantity_in,
      v_receipt.weight_in_kg,
      'piece_rate_weigh_void',
      new.doc_no,
      'piece_rate_weigh',
      new.doc_no,
      coalesce(new.cancel_reason, new.edit_reason, 'ยกเลิกชั่ง'),
      jsonb_build_object(
        'pieceRateLogId', new.id,
        'reversesMovementId', v_receipt.id,
        'docStatus', new.doc_status
      ),
      coalesce(new.cancelled_by, new.edited_by, new.operator_user_id)
    )
    on conflict (source_document_type, source_document_no)
      where source_document_type in (
        'piece_rate_weigh', 'piece_rate_weigh_void', 'piece_rate_issue',
        'piece_rate_issue_void', 'piece_rate_return'
      )
      do nothing
    returning id into v_void_movement_id;
  end if;

  return new;
end;
$$;

drop trigger if exists production_piece_rate_logs_sync_stock_movement
  on public.production_piece_rate_logs;
create trigger production_piece_rate_logs_sync_stock_movement
  after insert or update of doc_status on public.production_piece_rate_logs
  for each row execute function public.sync_piece_rate_log_stock_movement();

create or replace function public.create_piece_rate_stock_issue_atomic(
  p_piece_rate_doc_no text,
  p_issue_weight_kg numeric,
  p_issue_type text,
  p_remark text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.production_piece_rate_logs%rowtype;
  v_department record;
  v_issue public.production_piece_rate_stock_issues%rowtype;
  v_product_sku text;
  v_weight numeric(14, 3);
  v_receipt_movement_id uuid;
  v_movement_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  select * into v_log
  from public.production_piece_rate_logs
  where upper(trim(doc_no)) = upper(trim(p_piece_rate_doc_no))
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบป้ายแยมที่ต้องการเบิก';
  end if;
  if coalesce(v_log.doc_status, 'active') <> 'active' then
    raise exception using errcode = 'P0001', message = 'ป้ายแยมไม่ได้อยู่ในสถานะใช้งาน';
  end if;
  if exists (
    select 1 from public.production_piece_rate_stock_issues
    where piece_rate_log_id = v_log.id and issue_status = 'confirmed'
  ) then
    raise exception using errcode = 'P0001', message = 'ป้ายแยมนี้ถูกเบิกแล้ว';
  end if;

  v_weight := round(coalesce(p_issue_weight_kg, v_log.normalized_kg_amount_snapshot, v_log.input_value, 0)::numeric, 3);
  if v_weight <= 0 then
    raise exception using errcode = 'P0001', message = 'น้ำหนักเบิกต้องมากกว่า 0';
  end if;
  if v_weight > round(coalesce(v_log.normalized_kg_amount_snapshot, v_log.input_value, 0)::numeric, 3) then
    raise exception using errcode = 'P0001', message = 'น้ำหนักเบิกมากกว่าน้ำหนักชั่งเข้า';
  end if;

  v_product_sku := coalesce(nullif(trim(v_log.product_sku_code_snapshot), ''), nullif(trim(v_log.product_code_snapshot), ''));
  select * into v_department from public.resolve_piece_rate_stock_department(v_product_sku);
  v_receipt_movement_id := public.ensure_piece_rate_receipt_movement(v_log.id);

  insert into public.production_piece_rate_stock_issues (
    issue_no,
    piece_rate_log_id,
    piece_rate_doc_no,
    piece_rate_barcode,
    lot_no,
    product_code,
    product_sku_code,
    product_name_snapshot,
    issue_type,
    issue_weight_kg,
    issued_at,
    issued_by,
    remark,
    metadata
  ) values (
    public.generate_production_stock_reference_no('PRISS'),
    v_log.id,
    v_log.doc_no,
    v_log.doc_no,
    v_log.lot_no,
    coalesce(nullif(trim(v_log.product_goods_code_snapshot), ''), v_product_sku),
    v_product_sku,
    coalesce(nullif(trim(v_log.product_name_snapshot), ''), v_product_sku),
    case when upper(trim(coalesce(p_issue_type, 'KPF'))) in ('KPF', 'PB', 'PRISON')
      then upper(trim(coalesce(p_issue_type, 'KPF'))) else 'KPF' end,
    v_weight,
    v_now,
    p_actor_user_id,
    coalesce(nullif(trim(p_remark), ''), 'เบิกจากป้ายแยม'),
    jsonb_build_object('source', 'piece_rate_scan', 'receiptMovementId', v_receipt_movement_id)
  ) returning * into v_issue;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_out, weight_out_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRISS'), 'issue_out',
    (v_now at time zone 'Asia/Bangkok')::date, v_now,
    v_department.department_id, v_department.department_code, v_product_sku,
    v_issue.product_name_snapshot, '03', v_issue.lot_no, v_log.product_unit_snapshot,
    1, v_weight, 'piece_rate_issue', v_issue.issue_no,
    'piece_rate_weigh', v_log.doc_no, v_issue.remark,
    jsonb_build_object('pieceRateIssueId', v_issue.id, 'pieceRateLogId', v_log.id, 'barcode', v_log.doc_no),
    p_actor_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_stock_issues
  set stock_movement_id = v_movement_id
  where id = v_issue.id;

  return jsonb_build_object('issueId', v_issue.id, 'issueNo', v_issue.issue_no, 'movementId', v_movement_id);
end;
$$;

create or replace function public.create_piece_rate_stock_return_atomic(
  p_piece_rate_doc_no text,
  p_return_weight_kg numeric,
  p_remark text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.production_piece_rate_logs%rowtype;
  v_issue public.production_piece_rate_stock_issues%rowtype;
  v_return public.production_piece_rate_stock_returns%rowtype;
  v_department record;
  v_product_sku text;
  v_returned numeric(14, 3);
  v_weight numeric(14, 3);
  v_movement_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  select * into v_log
  from public.production_piece_rate_logs
  where upper(trim(doc_no)) = upper(trim(p_piece_rate_doc_no))
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบป้ายแยมที่ต้องการชั่งคืน';
  end if;

  select * into v_issue
  from public.production_piece_rate_stock_issues
  where piece_rate_log_id = v_log.id and issue_status = 'confirmed'
  order by issued_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ป้ายแยมนี้ยังไม่มีรายการเบิก';
  end if;

  select coalesce(sum(return_weight_kg), 0) into v_returned
  from public.production_piece_rate_stock_returns
  where piece_rate_issue_id = v_issue.id and return_status = 'confirmed';

  v_weight := round(coalesce(p_return_weight_kg, 0)::numeric, 3);
  if v_weight <= 0 then
    raise exception using errcode = 'P0001', message = 'น้ำหนักคืนต้องมากกว่า 0';
  end if;
  if v_weight > round(v_issue.issue_weight_kg - v_returned, 3) then
    raise exception using
      errcode = 'P0001',
      message = format('น้ำหนักคืนมากกว่ายอดคงเหลือ %s kg', round(v_issue.issue_weight_kg - v_returned, 3));
  end if;

  v_product_sku := coalesce(nullif(trim(v_issue.product_sku_code), ''), nullif(trim(v_log.product_sku_code_snapshot), ''), nullif(trim(v_log.product_code_snapshot), ''));
  select * into v_department from public.resolve_piece_rate_stock_department(v_product_sku);

  insert into public.production_piece_rate_stock_returns (
    return_no, piece_rate_issue_id, piece_rate_log_id, piece_rate_doc_no,
    piece_rate_barcode, lot_no, product_code, product_sku_code,
    product_name_snapshot, return_weight_kg, returned_at, returned_by,
    remark, metadata
  ) values (
    public.generate_production_stock_reference_no('PRRET'), v_issue.id, v_log.id,
    v_log.doc_no, v_log.doc_no, v_log.lot_no, v_issue.product_code,
    v_product_sku, v_issue.product_name_snapshot, v_weight, v_now, p_actor_user_id,
    coalesce(nullif(trim(p_remark), ''), 'ชั่งคืนจากป้ายแยม'),
    jsonb_build_object('source', 'piece_rate_scan_return', 'issueNo', v_issue.issue_no)
  ) returning * into v_return;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_in, weight_in_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRRET'), 'return_in',
    (v_now at time zone 'Asia/Bangkok')::date, v_now,
    v_department.department_id, v_department.department_code, v_product_sku,
    v_return.product_name_snapshot, '03', v_return.lot_no, v_log.product_unit_snapshot,
    0, v_weight, 'piece_rate_return', v_return.return_no,
    'piece_rate_issue', v_issue.issue_no, v_return.remark,
    jsonb_build_object('pieceRateReturnId', v_return.id, 'pieceRateIssueId', v_issue.id, 'pieceRateLogId', v_log.id),
    p_actor_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_stock_returns
  set stock_movement_id = v_movement_id
  where id = v_return.id;

  return jsonb_build_object('returnId', v_return.id, 'returnNo', v_return.return_no, 'movementId', v_movement_id);
end;
$$;

create or replace function public.cancel_piece_rate_stock_issue_atomic(
  p_piece_rate_doc_no text,
  p_cancel_reason text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.production_piece_rate_logs%rowtype;
  v_issue public.production_piece_rate_stock_issues%rowtype;
  v_issue_movement public.production_stock_movements%rowtype;
  v_movement_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  select * into v_log
  from public.production_piece_rate_logs
  where upper(trim(doc_no)) = upper(trim(p_piece_rate_doc_no))
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบป้ายแยมที่ต้องการยกเลิกเบิก';
  end if;

  select * into v_issue
  from public.production_piece_rate_stock_issues
  where piece_rate_log_id = v_log.id and issue_status = 'confirmed'
  order by issued_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ป้ายแยมนี้ไม่มีรายการเบิกที่ยกเลิกได้';
  end if;
  if exists (
    select 1 from public.production_piece_rate_stock_returns
    where piece_rate_issue_id = v_issue.id and return_status = 'confirmed'
  ) then
    raise exception using errcode = 'P0001', message = 'รายการนี้มีการชั่งคืนแล้ว จึงยกเลิกเบิกไม่ได้';
  end if;

  select * into v_issue_movement
  from public.production_stock_movements
  where id = v_issue.stock_movement_id
     or (source_document_type = 'piece_rate_issue' and source_document_no = v_issue.issue_no)
  order by case when id = v_issue.stock_movement_id then 0 else 1 end
  limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบ movement ของรายการเบิก';
  end if;

  update public.production_piece_rate_stock_issues
  set issue_status = 'cancelled', cancelled_at = v_now, cancelled_by = p_actor_user_id,
      cancel_reason = coalesce(nullif(trim(p_cancel_reason), ''), 'ยกเลิกเบิกจากหน้าสแกนป้ายแยม')
  where id = v_issue.id;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_in, weight_in_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRREV'), 'adjustment_in',
    (v_now at time zone 'Asia/Bangkok')::date, v_now,
    v_issue_movement.department_id, v_issue_movement.department_code,
    v_issue_movement.product_code, v_issue_movement.product_name_snapshot,
    v_issue_movement.category_code, v_issue_movement.lot_no, v_issue_movement.uom_name,
    v_issue_movement.quantity_out, v_issue_movement.weight_out_kg,
    'piece_rate_issue_void', v_issue.issue_no,
    'piece_rate_issue', v_issue.issue_no,
    coalesce(nullif(trim(p_cancel_reason), ''), 'ยกเลิกเบิกจากหน้าสแกนป้ายแยม'),
    jsonb_build_object('pieceRateIssueId', v_issue.id, 'reversesMovementId', v_issue_movement.id),
    p_actor_user_id
  ) returning id into v_movement_id;

  return jsonb_build_object('issueId', v_issue.id, 'issueNo', v_issue.issue_no, 'movementId', v_movement_id);
end;
$$;

create or replace function public.cancel_piece_rate_weigh_atomic(
  p_piece_rate_doc_no text,
  p_cancel_reason text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.production_piece_rate_logs%rowtype;
  v_after public.production_piece_rate_logs%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_reason text := coalesce(nullif(trim(p_cancel_reason), ''), 'ยกเลิกชั่งจากหน้าสแกนป้ายแยม');
begin
  select * into v_before
  from public.production_piece_rate_logs
  where upper(trim(doc_no)) = upper(trim(p_piece_rate_doc_no))
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบป้ายแยมที่ต้องการยกเลิกชั่ง';
  end if;
  if coalesce(v_before.doc_status, 'active') <> 'active' or v_before.replaced_by_log_id is not null then
    raise exception using errcode = 'P0001', message = 'เอกสารนี้ถูกยกเลิกหรือแทนที่แล้ว';
  end if;
  if exists (
    select 1 from public.production_piece_rate_stock_issues
    where piece_rate_log_id = v_before.id and issue_status = 'confirmed'
  ) then
    raise exception using errcode = 'P0001', message = 'เอกสารนี้ถูกเบิกแล้ว ต้องยกเลิกเบิกก่อนยกเลิกชั่ง';
  end if;

  update public.production_piece_rate_logs
  set is_edited = true,
      edited_at = v_now,
      edited_by = p_actor_user_id,
      edit_reason = v_reason,
      doc_status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by = p_actor_user_id,
      cancel_reason = v_reason
  where id = v_before.id
    and coalesce(doc_status, 'active') = 'active'
    and replaced_by_log_id is null
  returning * into v_after;

  if not found then
    raise exception using errcode = 'P0001', message = 'เอกสารถูกเปลี่ยนแปลงโดยคำขออื่น กรุณาสแกนใหม่';
  end if;

  insert into public.production_piece_rate_log_revisions (
    log_id, action, before_data, after_data, edited_by, edit_reason
  ) values (
    v_before.id, 'cancel', to_jsonb(v_before), to_jsonb(v_after), p_actor_user_id, v_reason
  );

  return jsonb_build_object('logId', v_after.id, 'docNo', v_after.doc_no, 'docStatus', v_after.doc_status);
end;
$$;

revoke all on function public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.create_piece_rate_stock_return_atomic(text, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_piece_rate_stock_issue_atomic(text, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_piece_rate_weigh_atomic(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid) to service_role;
grant execute on function public.create_piece_rate_stock_return_atomic(text, numeric, text, uuid) to service_role;
grant execute on function public.cancel_piece_rate_stock_issue_atomic(text, text, uuid) to service_role;
grant execute on function public.cancel_piece_rate_weigh_atomic(text, text, uuid) to service_role;

-- Backfill historical rows only when an owner department can be resolved.
do $$
declare
  v_log record;
begin
  for v_log in
    select logs.id
    from public.production_piece_rate_logs logs
    join public.production_department_products mappings
      on upper(trim(mappings.sku_code)) = upper(trim(coalesce(logs.product_sku_code_snapshot, logs.product_code_snapshot)))
    join public.production_departments departments
      on departments.id = mappings.department_id
    where logs.stock_movement_id is null
      and coalesce(logs.normalized_kg_amount_snapshot, logs.input_value, 0) > 0
      and nullif(trim(logs.lot_no), '') is not null
      and departments.deleted_at is null
      and departments.is_active = true
    order by logs.logged_at, mappings.is_owner desc, mappings.id
  loop
    begin
      perform public.ensure_piece_rate_receipt_movement(v_log.id);
    exception when others then
      raise warning 'piece-rate stock backfill skipped log %: %', v_log.id, sqlerrm;
    end;
  end loop;
end;
$$;

update public.production_piece_rate_stock_issues issues
set product_sku_code = coalesce(
  nullif(trim(logs.product_sku_code_snapshot), ''),
  nullif(trim(logs.product_code_snapshot), '')
)
from public.production_piece_rate_logs logs
where logs.id = issues.piece_rate_log_id
  and nullif(trim(issues.product_sku_code), '') is null;

update public.production_piece_rate_stock_returns returns
set product_sku_code = coalesce(
  nullif(trim(issues.product_sku_code), ''),
  nullif(trim(logs.product_sku_code_snapshot), ''),
  nullif(trim(logs.product_code_snapshot), '')
)
from public.production_piece_rate_stock_issues issues
join public.production_piece_rate_logs logs on logs.id = issues.piece_rate_log_id
where issues.id = returns.piece_rate_issue_id
  and nullif(trim(returns.product_sku_code), '') is null;

do $$
declare
  v_issue record;
  v_department record;
  v_movement_id uuid;
begin
  for v_issue in
    select issues.*, logs.product_unit_snapshot
    from public.production_piece_rate_stock_issues issues
    join public.production_piece_rate_logs logs on logs.id = issues.piece_rate_log_id
    where issues.stock_movement_id is null
    order by issues.issued_at, issues.id
  loop
    begin
      select * into v_department
      from public.resolve_piece_rate_stock_department(v_issue.product_sku_code);

      insert into public.production_stock_movements (
        movement_no, movement_type, movement_date, movement_at,
        department_id, department_code, product_code, product_name_snapshot,
        category_code, lot_no, uom_name, quantity_out, weight_out_kg,
        source_document_type, source_document_no, reference_type, reference_no,
        remark, metadata, created_by
      ) values (
        public.generate_production_stock_reference_no('MVPRISS'), 'issue_out',
        (v_issue.issued_at at time zone 'Asia/Bangkok')::date, v_issue.issued_at,
        v_department.department_id, v_department.department_code, v_issue.product_sku_code,
        v_issue.product_name_snapshot, '03', v_issue.lot_no, v_issue.product_unit_snapshot,
        1, v_issue.issue_weight_kg, 'piece_rate_issue', v_issue.issue_no,
        'piece_rate_weigh', v_issue.piece_rate_doc_no,
        coalesce(v_issue.remark, 'เบิกจากป้ายแยม'),
        coalesce(v_issue.metadata, '{}'::jsonb) || jsonb_build_object('backfilled', true, 'pieceRateIssueId', v_issue.id),
        v_issue.issued_by
      )
      on conflict (source_document_type, source_document_no)
        where source_document_type in (
          'piece_rate_weigh', 'piece_rate_weigh_void', 'piece_rate_issue',
          'piece_rate_issue_void', 'piece_rate_return'
        )
        do update set source_document_no = excluded.source_document_no
      returning id into v_movement_id;

      update public.production_piece_rate_stock_issues
      set stock_movement_id = v_movement_id
      where id = v_issue.id;
    exception when others then
      raise warning 'piece-rate issue movement backfill skipped issue %: %', v_issue.id, sqlerrm;
    end;
  end loop;
end;
$$;

do $$
declare
  v_return record;
  v_department record;
  v_movement_id uuid;
begin
  for v_return in
    select returns.*, issues.issue_no, logs.product_unit_snapshot
    from public.production_piece_rate_stock_returns returns
    join public.production_piece_rate_stock_issues issues on issues.id = returns.piece_rate_issue_id
    join public.production_piece_rate_logs logs on logs.id = returns.piece_rate_log_id
    where returns.stock_movement_id is null
      and returns.return_status = 'confirmed'
    order by returns.returned_at, returns.id
  loop
    begin
      select * into v_department
      from public.resolve_piece_rate_stock_department(v_return.product_sku_code);

      insert into public.production_stock_movements (
        movement_no, movement_type, movement_date, movement_at,
        department_id, department_code, product_code, product_name_snapshot,
        category_code, lot_no, uom_name, quantity_in, weight_in_kg,
        source_document_type, source_document_no, reference_type, reference_no,
        remark, metadata, created_by
      ) values (
        public.generate_production_stock_reference_no('MVPRRET'), 'return_in',
        (v_return.returned_at at time zone 'Asia/Bangkok')::date, v_return.returned_at,
        v_department.department_id, v_department.department_code, v_return.product_sku_code,
        v_return.product_name_snapshot, '03', v_return.lot_no, v_return.product_unit_snapshot,
        0, v_return.return_weight_kg, 'piece_rate_return', v_return.return_no,
        'piece_rate_issue', v_return.issue_no,
        coalesce(v_return.remark, 'ชั่งคืนจากป้ายแยม'),
        coalesce(v_return.metadata, '{}'::jsonb) || jsonb_build_object('backfilled', true, 'pieceRateReturnId', v_return.id),
        v_return.returned_by
      )
      on conflict (source_document_type, source_document_no)
        where source_document_type in (
          'piece_rate_weigh', 'piece_rate_weigh_void', 'piece_rate_issue',
          'piece_rate_issue_void', 'piece_rate_return'
        )
        do update set source_document_no = excluded.source_document_no
      returning id into v_movement_id;

      update public.production_piece_rate_stock_returns
      set stock_movement_id = v_movement_id
      where id = v_return.id;
    exception when others then
      raise warning 'piece-rate return movement backfill skipped return %: %', v_return.id, sqlerrm;
    end;
  end loop;
end;
$$;

insert into public.production_stock_movements (
  movement_no, movement_type, movement_date, movement_at,
  department_id, department_code, product_code, product_name_snapshot,
  category_code, lot_no, uom_name, quantity_out, weight_out_kg,
  source_document_type, source_document_no, reference_type, reference_no,
  remark, metadata, created_by
)
select
  public.generate_production_stock_reference_no('MVPRVOID'), 'adjustment_out',
  (coalesce(logs.cancelled_at, logs.edited_at, logs.logged_at) at time zone 'Asia/Bangkok')::date,
  coalesce(logs.cancelled_at, logs.edited_at, logs.logged_at),
  receipt.department_id, receipt.department_code, receipt.product_code, receipt.product_name_snapshot,
  receipt.category_code, receipt.lot_no, receipt.uom_name,
  receipt.quantity_in, receipt.weight_in_kg,
  'piece_rate_weigh_void', logs.doc_no, 'piece_rate_weigh', logs.doc_no,
  coalesce(logs.cancel_reason, logs.edit_reason, 'ยกเลิกชั่ง'),
  jsonb_build_object('backfilled', true, 'pieceRateLogId', logs.id, 'reversesMovementId', receipt.id),
  coalesce(logs.cancelled_by, logs.edited_by, logs.operator_user_id)
from public.production_piece_rate_logs logs
join public.production_stock_movements receipt
  on receipt.source_document_type = 'piece_rate_weigh'
 and receipt.source_document_no = logs.doc_no
where logs.doc_status in ('cancelled', 'replaced')
on conflict (source_document_type, source_document_no)
  where source_document_type in (
    'piece_rate_weigh', 'piece_rate_weigh_void', 'piece_rate_issue',
    'piece_rate_issue_void', 'piece_rate_return'
  )
  do nothing;

insert into public.production_stock_movements (
  movement_no, movement_type, movement_date, movement_at,
  department_id, department_code, product_code, product_name_snapshot,
  category_code, lot_no, uom_name, quantity_in, weight_in_kg,
  source_document_type, source_document_no, reference_type, reference_no,
  remark, metadata, created_by
)
select
  public.generate_production_stock_reference_no('MVPRREV'), 'adjustment_in',
  (coalesce(issues.cancelled_at, issues.issued_at) at time zone 'Asia/Bangkok')::date,
  coalesce(issues.cancelled_at, issues.issued_at),
  movement.department_id, movement.department_code, movement.product_code, movement.product_name_snapshot,
  movement.category_code, movement.lot_no, movement.uom_name,
  movement.quantity_out, movement.weight_out_kg,
  'piece_rate_issue_void', issues.issue_no, 'piece_rate_issue', issues.issue_no,
  coalesce(issues.cancel_reason, 'ยกเลิกเบิก'),
  jsonb_build_object('backfilled', true, 'pieceRateIssueId', issues.id, 'reversesMovementId', movement.id),
  coalesce(issues.cancelled_by, issues.issued_by)
from public.production_piece_rate_stock_issues issues
join public.production_stock_movements movement
  on movement.source_document_type = 'piece_rate_issue'
 and movement.source_document_no = issues.issue_no
where issues.issue_status = 'cancelled'
on conflict (source_document_type, source_document_no)
  where source_document_type in (
    'piece_rate_weigh', 'piece_rate_weigh_void', 'piece_rate_issue',
    'piece_rate_issue_void', 'piece_rate_return'
  )
  do nothing;
