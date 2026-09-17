alter table public.production_piece_rate_stock_issues
  add column if not exists issue_date date;

update public.production_piece_rate_stock_issues
set issue_date = (issued_at at time zone 'Asia/Bangkok')::date
where issue_date is null;

alter table public.production_piece_rate_stock_issues
  alter column issue_date set default (timezone('Asia/Bangkok', now()))::date,
  alter column issue_date set not null;

create index if not exists production_piece_rate_stock_issues_issue_date_idx
  on public.production_piece_rate_stock_issues (issue_date desc, issued_at desc);

drop function if exists public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb);
drop function if exists public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb, date);
drop function if exists public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid);
drop function if exists public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid, date);

create function public.create_piece_rate_stock_issue_atomic(
  p_piece_rate_doc_no text,
  p_issue_weight_kg numeric,
  p_issue_type text,
  p_remark text,
  p_actor_user_id uuid,
  p_issue_date date
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
  v_issue_date date := coalesce(p_issue_date, (timezone('Asia/Bangkok', now()))::date);
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
    product_name_snapshot, issue_type, issue_weight_kg, issue_date, issued_at,
    issued_by, remark, metadata
  ) values (
    public.generate_production_stock_reference_no('PRISS'), v_log.id, v_source_return.id,
    v_log.doc_no, v_barcode, coalesce(v_source_return.lot_no, v_log.lot_no),
    coalesce(v_source_return.product_code, nullif(trim(v_log.product_goods_code_snapshot), ''), v_product_sku),
    v_product_sku, coalesce(v_source_return.product_name_snapshot, nullif(trim(v_log.product_name_snapshot), ''), v_product_sku),
    case when upper(trim(coalesce(p_issue_type, 'KPF'))) in ('KPF', 'PB', 'PRISON') then upper(trim(coalesce(p_issue_type, 'KPF'))) else 'KPF' end,
    v_weight, v_issue_date, v_now, p_actor_user_id, coalesce(nullif(trim(p_remark), ''), 'เบิกจากป้ายแยม'),
    jsonb_build_object('source', case when v_source_return.id is null then 'piece_rate_scan' else 'piece_rate_return_label' end,
      'barcode', v_barcode, 'sourceReturnId', v_source_return.id, 'issueDate', v_issue_date)
  ) returning * into v_issue;

  insert into public.production_stock_movements (
    movement_no, movement_type, movement_date, movement_at,
    department_id, department_code, product_code, product_name_snapshot,
    category_code, lot_no, uom_name, quantity_out, weight_out_kg,
    source_document_type, source_document_no, reference_type, reference_no,
    remark, metadata, created_by
  ) values (
    public.generate_production_stock_reference_no('MVPRISS'), 'issue_out',
    v_issue_date, v_now, v_department.department_id,
    v_department.department_code, v_product_sku, v_issue.product_name_snapshot,
    '03', v_issue.lot_no, v_log.product_unit_snapshot, 1, v_weight,
    'piece_rate_issue', v_issue.issue_no,
    case when v_source_return.id is null then 'piece_rate_weigh' else 'piece_rate_return' end,
    coalesce(v_source_return.return_no, v_log.doc_no), v_issue.remark,
    jsonb_build_object('pieceRateIssueId', v_issue.id, 'pieceRateLogId', v_log.id,
      'barcode', v_barcode, 'sourceReturnId', v_source_return.id, 'issueDate', v_issue_date), p_actor_user_id
  ) returning id into v_movement_id;

  update public.production_piece_rate_stock_issues set stock_movement_id = v_movement_id where id = v_issue.id;
  return jsonb_build_object('issueId', v_issue.id, 'issueNo', v_issue.issue_no, 'movementId', v_movement_id, 'issueDate', v_issue_date);
end;
$$;

create function public.create_piece_rate_stock_issue_batch_atomic(
  p_barcodes text[], p_issue_type text, p_remark text,
  p_actor_user_id uuid, p_metadata jsonb, p_issue_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_total integer := coalesce(cardinality(p_barcodes), 0);
  v_succeeded integer := 0;
begin
  if v_total = 0 then
    raise exception using errcode = 'P0001', message = 'No barcodes selected';
  end if;
  if v_total > 50 then
    raise exception using errcode = 'P0001', message = 'A maximum of 50 barcodes is allowed';
  end if;

  foreach v_barcode in array p_barcodes loop
    v_barcode := upper(trim(coalesce(v_barcode, '')));
    if v_barcode = '' then continue; end if;
    begin
      v_result := public.create_piece_rate_stock_issue_atomic(
        v_barcode, null, p_issue_type, p_remark, p_actor_user_id, p_issue_date
      );

      update public.production_piece_rate_stock_issues
      set metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
      where id = (v_result->>'issueId')::uuid;

      update public.production_stock_movements
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'employeeCode', p_metadata->>'issueEmployeeCode',
        'employeeName', p_metadata->>'issueEmployeeName',
        'fgProductCode', p_metadata->>'fgProductCode',
        'fgProductName', p_metadata->>'fgProductName',
        'issueDate', p_issue_date
      )
      where id = (v_result->>'movementId')::uuid;

      v_succeeded := v_succeeded + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode, 'ok', true, 'issueNo', v_result->>'issueNo'
      ));
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode, 'ok', false, 'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'totalCount', v_total,
    'succeededCount', v_succeeded,
    'failedCount', v_total - v_succeeded,
    'results', v_results
  );
end;
$$;

revoke all on function public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid, date) from public, anon, authenticated;
grant execute on function public.create_piece_rate_stock_issue_atomic(text, numeric, text, text, uuid, date) to service_role;
revoke all on function public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb, date) from public, anon, authenticated;
grant execute on function public.create_piece_rate_stock_issue_batch_atomic(text[], text, text, uuid, jsonb, date) to service_role;
