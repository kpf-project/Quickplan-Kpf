alter table public.production_piece_rate_stock_returns
  add column if not exists return_barcode text,
  add column if not exists return_date date;

with numbered as (
  select id,
    piece_rate_barcode || 'X' || lpad(
      row_number() over (partition by piece_rate_issue_id order by returned_at, id)::text,
      2,
      '0'
    ) as generated_barcode,
    (returned_at at time zone 'Asia/Bangkok')::date as generated_date
  from public.production_piece_rate_stock_returns
)
update public.production_piece_rate_stock_returns returns
set return_barcode = coalesce(returns.return_barcode, numbered.generated_barcode),
    return_date = coalesce(returns.return_date, numbered.generated_date)
from numbered
where numbered.id = returns.id;

alter table public.production_piece_rate_stock_returns
  alter column return_barcode set not null,
  alter column return_date set not null;

create unique index if not exists production_piece_rate_stock_returns_return_barcode_uidx
  on public.production_piece_rate_stock_returns (upper(return_barcode));

alter table public.production_piece_rate_stock_issues
  add column if not exists source_return_id uuid
    references public.production_piece_rate_stock_returns(id) on delete restrict;

drop index if exists public.production_piece_rate_stock_issues_active_log_uidx;
create unique index if not exists production_piece_rate_stock_issues_active_original_uidx
  on public.production_piece_rate_stock_issues (piece_rate_log_id)
  where issue_status = 'confirmed' and source_return_id is null;
create unique index if not exists production_piece_rate_stock_issues_active_return_uidx
  on public.production_piece_rate_stock_issues (source_return_id)
  where issue_status = 'confirmed' and source_return_id is not null;

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
  v_barcode text := upper(trim(coalesce(p_piece_rate_doc_no, '')));
  v_log public.production_piece_rate_logs%rowtype;
  v_source_return public.production_piece_rate_stock_returns%rowtype;
  v_department record;
  v_issue public.production_piece_rate_stock_issues%rowtype;
  v_product_sku text;
  v_available_weight numeric(14, 3);
  v_weight numeric(14, 3);
  v_movement_id uuid;
  v_now timestamptz := now();
begin
  select * into v_log from public.production_piece_rate_logs
  where upper(trim(doc_no)) = v_barcode for update;

  if not found then
    select * into v_source_return from public.production_piece_rate_stock_returns
    where upper(trim(return_barcode)) = v_barcode and return_status = 'confirmed'
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'ไม่พบป้ายแยมที่ต้องการเบิก';
    end if;
    select * into v_log from public.production_piece_rate_logs where id = v_source_return.piece_rate_log_id;
    v_available_weight := v_source_return.return_weight_kg;
    if exists (select 1 from public.production_piece_rate_stock_issues where source_return_id = v_source_return.id and issue_status = 'confirmed') then
      raise exception using errcode = 'P0001', message = 'ป้ายชั่งคืนนี้ถูกเบิกแล้ว';
    end if;
  else
    if coalesce(v_log.doc_status, 'active') <> 'active' then
      raise exception using errcode = 'P0001', message = 'ป้ายแยมไม่ได้อยู่ในสถานะใช้งาน';
    end if;
    v_available_weight := round(coalesce(v_log.normalized_kg_amount_snapshot, v_log.input_value, 0)::numeric, 3);
    if exists (select 1 from public.production_piece_rate_stock_issues where piece_rate_log_id = v_log.id and source_return_id is null and issue_status = 'confirmed') then
      raise exception using errcode = 'P0001', message = 'ป้ายแยมนี้ถูกเบิกแล้ว';
    end if;
    perform public.ensure_piece_rate_receipt_movement(v_log.id);
  end if;

  v_weight := round(coalesce(p_issue_weight_kg, v_available_weight)::numeric, 3);
  if v_weight <= 0 or v_weight > v_available_weight then
    raise exception using errcode = 'P0001', message = 'น้ำหนักเบิกไม่ถูกต้องหรือมากกว่าน้ำหนักบนป้าย';
  end if;

  v_product_sku := coalesce(nullif(trim(v_source_return.product_sku_code), ''), nullif(trim(v_log.product_sku_code_snapshot), ''), nullif(trim(v_log.product_code_snapshot), ''));
  select * into v_department from public.resolve_piece_rate_stock_department(v_product_sku);

  insert into public.production_piece_rate_stock_issues (
    issue_no, piece_rate_log_id, source_return_id, piece_rate_doc_no,
    piece_rate_barcode, lot_no, product_code, product_sku_code,
    product_name_snapshot, issue_type, issue_weight_kg, issued_at,
    issued_by, remark, metadata
  ) values (
    public.generate_production_stock_reference_no('PRISS'), v_log.id, v_source_return.id,
    v_log.doc_no, v_barcode, coalesce(v_source_return.lot_no, v_log.lot_no),
    coalesce(v_source_return.product_code, nullif(trim(v_log.product_goods_code_snapshot), ''), v_product_sku),
    v_product_sku, coalesce(v_source_return.product_name_snapshot, nullif(trim(v_log.product_name_snapshot), ''), v_product_sku),
    case when upper(trim(coalesce(p_issue_type, 'KPF'))) in ('KPF', 'PB', 'PRISON') then upper(trim(coalesce(p_issue_type, 'KPF'))) else 'KPF' end,
    v_weight, v_now, p_actor_user_id, coalesce(nullif(trim(p_remark), ''), 'เบิกจากป้ายแยม'),
    jsonb_build_object('source', case when v_source_return.id is null then 'piece_rate_scan' else 'piece_rate_return_label' end,
      'barcode', v_barcode, 'sourceReturnId', v_source_return.id)
  ) returning * into v_issue;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_out, weight_out_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRISS'), 'issue_out',
    (v_now at time zone 'Asia/Bangkok')::date, v_now, v_department.department_id,
    v_department.department_code, v_product_sku, v_issue.product_name_snapshot,
    '03', v_issue.lot_no, v_log.product_unit_snapshot, 1, v_weight,
    'piece_rate_issue', v_issue.issue_no,
    case when v_source_return.id is null then 'piece_rate_weigh' else 'piece_rate_return' end,
    coalesce(v_source_return.return_no, v_log.doc_no), v_issue.remark,
    jsonb_build_object('pieceRateIssueId', v_issue.id, 'pieceRateLogId', v_log.id,
      'barcode', v_barcode, 'sourceReturnId', v_source_return.id), p_actor_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_stock_issues set stock_movement_id = v_movement_id where id = v_issue.id;
  return jsonb_build_object('issueId', v_issue.id, 'issueNo', v_issue.issue_no, 'movementId', v_movement_id);
end;
$$;

create or replace function public.create_piece_rate_stock_return_atomic(
  p_piece_rate_doc_no text,
  p_return_weight_kg numeric,
  p_remark text,
  p_actor_user_id uuid,
  p_return_date date
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
  v_source_barcode text := upper(trim(coalesce(p_piece_rate_doc_no, '')));
  v_return_barcode text;
  v_returned numeric(14, 3);
  v_weight numeric(14, 3);
  v_sequence integer;
  v_movement_id uuid;
  v_bangkok_now timestamp := timezone('Asia/Bangkok', now());
  v_business_date date := coalesce(p_return_date, timezone('Asia/Bangkok', now())::date);
  v_effective_at timestamptz;
begin
  if v_business_date > timezone('Asia/Bangkok', now())::date then
    raise exception using errcode = 'P0001', message = 'วันที่ชั่งคืนต้องไม่เกินวันที่ปัจจุบัน';
  end if;

  select * into v_issue
  from public.production_piece_rate_stock_issues
  where upper(trim(piece_rate_barcode)) = v_source_barcode
    and issue_status = 'confirmed'
  order by issued_at desc
  limit 1
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ป้ายนี้ยังไม่มีรายการเบิกที่สามารถชั่งคืนได้';
  end if;

  select * into v_log
  from public.production_piece_rate_logs
  where id = v_issue.piece_rate_log_id;

  select coalesce(sum(return_weight_kg), 0), count(*) + 1
  into v_returned, v_sequence
  from public.production_piece_rate_stock_returns
  where piece_rate_issue_id = v_issue.id;

  v_weight := round(coalesce(p_return_weight_kg, 0)::numeric, 3);
  if v_weight <= 0 then
    raise exception using errcode = 'P0001', message = 'น้ำหนักคืนต้องมากกว่า 0';
  end if;
  if v_weight > round(v_issue.issue_weight_kg - v_returned, 3) then
    raise exception using errcode = 'P0001',
      message = format('น้ำหนักคืนมากกว่ายอดคงเหลือ %s kg', round(v_issue.issue_weight_kg - v_returned, 3));
  end if;

  v_return_barcode := v_source_barcode || 'X' || lpad(v_sequence::text, 2, '0');
  v_effective_at := (v_business_date::timestamp + v_bangkok_now::time) at time zone 'Asia/Bangkok';
  v_product_sku := coalesce(nullif(trim(v_issue.product_sku_code), ''), nullif(trim(v_log.product_sku_code_snapshot), ''), nullif(trim(v_log.product_code_snapshot), ''));
  select * into v_department from public.resolve_piece_rate_stock_department(v_product_sku);

  insert into public.production_piece_rate_stock_returns (
    return_no, piece_rate_issue_id, piece_rate_log_id, piece_rate_doc_no,
    piece_rate_barcode, return_barcode, return_date, lot_no, product_code,
    product_sku_code, product_name_snapshot, return_weight_kg, returned_at,
    returned_by, remark, metadata
  ) values (
    public.generate_production_stock_reference_no('PRRET'), v_issue.id, v_log.id,
    v_log.doc_no, v_source_barcode, v_return_barcode, v_business_date, v_issue.lot_no,
    v_issue.product_code, v_product_sku, v_issue.product_name_snapshot, v_weight,
    v_effective_at, p_actor_user_id,
    coalesce(nullif(trim(p_remark), ''), 'ชั่งคืนจากป้ายแยม'),
    jsonb_build_object('source', 'piece_rate_scan_return', 'issueNo', v_issue.issue_no,
      'sourceBarcode', v_source_barcode, 'labelBarcode', v_return_barcode,
      'businessDate', v_business_date)
  ) returning * into v_return;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_in, weight_in_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRRET'), 'return_in',
    v_business_date, v_effective_at, v_department.department_id,
    v_department.department_code, v_product_sku, v_return.product_name_snapshot,
    '03', v_return.lot_no, v_log.product_unit_snapshot, 0, v_weight,
    'piece_rate_return', v_return.return_no, 'piece_rate_issue', v_issue.issue_no,
    v_return.remark,
    jsonb_build_object('pieceRateReturnId', v_return.id, 'pieceRateIssueId', v_issue.id,
      'pieceRateLogId', v_log.id, 'sourceBarcode', v_source_barcode,
      'labelBarcode', v_return_barcode, 'businessDate', v_business_date),
    p_actor_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_stock_returns
  set stock_movement_id = v_movement_id
  where id = v_return.id;

  return jsonb_build_object('returnId', v_return.id, 'returnNo', v_return.return_no,
    'barcode', v_return_barcode, 'returnDate', v_business_date,
    'returnedAt', v_effective_at, 'movementId', v_movement_id);
end;
$$;

revoke all on function public.create_piece_rate_stock_return_atomic(text, numeric, text, uuid, date)
  from public, anon, authenticated;
grant execute on function public.create_piece_rate_stock_return_atomic(text, numeric, text, uuid, date)
  to service_role;
