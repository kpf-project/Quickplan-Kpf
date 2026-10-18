begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table repair_targets (
  employee_code text primary key,
  expected_count numeric not null,
  expected_weight numeric not null,
  log_id uuid not null,
  request_id text not null,
  minute_offset integer not null
);

insert into repair_targets values
  ('KPF-01710.', 32, 160.100, '9fe01537-f583-4ef3-8347-346bfa5d16fb', 'repair-20260929-kpf01710-missing-scan', 10),
  ('02051',      24, 120.070, 'f48729e8-6794-4345-82f7-6140eec8f5f8', 'repair-20260929-02051-missing-scan',      11);

create temp table before_summary as
select
  t.employee_code,
  count(l.id) as active_count,
  coalesce(sum(l.count_value_snapshot), 0) as total_count,
  coalesce(sum(l.normalized_kg_amount_snapshot), 0) as total_weight_kg,
  coalesce(sum(l.wage_amount_snapshot), 0) as total_wage
from repair_targets t
left join public.production_piece_rate_logs l
  on l.employee_code = t.employee_code
 and (l.actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
 and (l.doc_status = 'active' or l.doc_status is null)
 and l.replaced_by_log_id is null
group by t.employee_code;

create temp table source_templates as
select distinct on (l.employee_code) l.*
from public.production_piece_rate_logs l
join repair_targets t on t.employee_code = l.employee_code
where l.product_goods_code_snapshot = 'B03-0003'
  and l.product_barcode_snapshot = '8852681022640'
  and l.lot_no = '2909260003-1'
  and (l.actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
  and (l.doc_status = 'active' or l.doc_status is null)
  and l.replaced_by_log_id is null
order by l.employee_code, l.actual_weighed_at desc, l.doc_no desc;

do $$
begin
  if (select count(*) from before_summary s join repair_targets t using (employee_code)
      where s.active_count = t.expected_count
        and s.total_count = t.expected_count
        and round(s.total_weight_kg::numeric, 3) = t.expected_weight) <> 2 then
    raise exception 'Employee totals changed; refusing repair';
  end if;

  if (select count(*) from source_templates) <> 2 or exists (
    select 1
    from source_templates
    where product_name_snapshot <> 'แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)'
      or product_unit_snapshot <> 'ปี๊บ/5กก.'
      or input_mode_snapshot <> 'kg'
      or wage_basis_snapshot <> 'kg'
      or pay_rate_per_kg_snapshot <> 4.5
      or machine_code <> 'P02'
      or operator_username_snapshot <> 'biscuitkpf'
  ) then
    raise exception 'Source scan template changed; refusing repair';
  end if;

  if exists (
    select 1
    from repair_targets t
    left join public.production_piece_rate_logs l
      on l.id = t.log_id or l.request_id = t.request_id
    where l.id is not null
  ) then
    raise exception 'A repair request already exists';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('summary', (select jsonb_agg(to_jsonb(s) order by employee_code) from before_summary s), 'counter', (select to_jsonb(c) from public.production_piece_rate_daily_doc_counters c where c.doc_date = date '2026-09-29'))) to '.backups/missing-piece-rate-scans-20260929-before.json'
\endif

create temp table inserted_repairs (
  employee_code text,
  log_id uuid,
  request_id text,
  doc_no text,
  captured_at timestamptz,
  result jsonb
);

do $$
declare
  target record;
  template public.production_piece_rate_logs%rowtype;
  document jsonb;
  payload jsonb;
  inserted jsonb;
  captured_at timestamptz;
  base_time timestamptz;
begin
  select max(l.actual_weighed_at) into base_time
  from public.production_piece_rate_logs l
  where (l.actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
    and (l.doc_status = 'active' or l.doc_status is null)
    and l.replaced_by_log_id is null;

  if base_time is null then
    raise exception 'No Sep 29 scan baseline found';
  end if;

  for target in select * from repair_targets order by minute_offset loop
    select * into template
    from source_templates
    where employee_code = target.employee_code;

    captured_at := base_time + make_interval(mins => target.minute_offset);
    if (captured_at at time zone 'Asia/Bangkok')::date <> date '2026-09-29' then
      raise exception 'Generated correction timestamp left Sep 29';
    end if;

    document := public.next_piece_rate_doc_number_for_date(
      'P02',
      2569,
      9,
      date '2026-09-29',
      'daily_scan',
      template.operator_user_id,
      target.request_id,
      jsonb_build_object(
        'historicalBackfill', true,
        'reason', 'เติมรายการสแกนตกหล่นตามยอดหน้างานที่ผู้ใช้ยืนยัน',
        'employeeCode', target.employee_code
      )
    );

    payload := jsonb_build_object(
      'id', target.log_id,
      'request_id', target.request_id,
      'employee_code', template.employee_code,
      'employee_name_snapshot', template.employee_name_snapshot,
      'employee_department_snapshot', template.employee_department_snapshot,
      'employee_branch_snapshot', template.employee_branch_snapshot,
      'employee_check_in_snapshot', template.employee_check_in_snapshot,
      'employee_check_out_snapshot', template.employee_check_out_snapshot,
      'product_code_snapshot', template.product_code_snapshot,
      'product_goods_code_snapshot', template.product_goods_code_snapshot,
      'product_sku_code_snapshot', template.product_sku_code_snapshot,
      'product_name_snapshot', template.product_name_snapshot,
      'product_brand_code_snapshot', template.product_brand_code_snapshot,
      'product_brand_name_snapshot', template.product_brand_name_snapshot,
      'product_unit_snapshot', template.product_unit_snapshot,
      'product_barcode_snapshot', template.product_barcode_snapshot,
      'piece_rate_profile_id', template.piece_rate_profile_id,
      'piece_rate_profile_name_snapshot', template.piece_rate_profile_name_snapshot,
      'weight_option_id_snapshot', template.weight_option_id_snapshot,
      'weight_option_label_snapshot', template.weight_option_label_snapshot,
      'weight_kg_snapshot', template.weight_kg_snapshot,
      'input_mode_snapshot', template.input_mode_snapshot,
      'wage_basis_snapshot', template.wage_basis_snapshot,
      'input_value', 5.000,
      'count_value_snapshot', 1,
      'input_label_snapshot', template.input_label_snapshot,
      'input_unit_label_snapshot', template.input_unit_label_snapshot,
      'normalized_kg_amount_snapshot', 5.000,
      'kg_per_pail_snapshot', template.kg_per_pail_snapshot,
      'pay_rate_per_kg_snapshot', template.pay_rate_per_kg_snapshot,
      'pay_rate_per_unit_snapshot', template.pay_rate_per_unit_snapshot,
      'wage_amount_snapshot', 22.500,
      'source', 'piece_rate_scan',
      'raw_product_barcode_payload', '8852681022640',
      'raw_employee_qr_payload', template.raw_employee_qr_payload,
      'operator_user_id', template.operator_user_id,
      'operator_username_snapshot', template.operator_username_snapshot,
      'metadata', jsonb_build_object(
        'screen', 'piece-rate-scan-form',
        'inputMode', 'kg',
        'wageBasis', 'kg',
        'countValue', 1,
        'machineCode', 'P02',
        'scaleConnected', false,
        'resolvedInputMode', 'kg',
        'resolvedWageBasis', 'kg',
        'normalizedKgAmount', 5.000,
        'workDate', '2026-09-29',
        'scaleAudit', jsonb_build_object(
          'capturedAt', to_char(captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'historicalBackfill', true
        ),
        'historicalBackfill', jsonb_build_object(
          'reason', 'เติมรายการสแกนตกหล่นตามยอดหน้างานที่ผู้ใช้ยืนยัน',
          'recordedAt', now(),
          'confirmedWeightKg', 5.000
        )
      ),
      'machine_code', 'P02',
      'doc_year_be', 2569,
      'doc_round', 1,
      'doc_seq', (document->>'doc_seq')::integer,
      'doc_no', document->>'doc_no',
      'lot_no', '2909260003-1',
      'logged_at', captured_at,
      'doc_status', 'active'
    );

    inserted := public.insert_piece_rate_log_safely(
      payload,
      template.employee_code,
      '8852681022640',
      'P02',
      'piece_rate_scan',
      5.000,
      captured_at,
      300,
      0.02
    );

    if coalesce((inserted->>'duplicated')::boolean, false) then
      raise exception 'Safe insert detected a duplicate for %', target.employee_code;
    end if;

    insert into inserted_repairs values (
      target.employee_code,
      target.log_id,
      target.request_id,
      document->>'doc_no',
      captured_at,
      inserted
    );
  end loop;
end;
$$;

do $$
begin
  if (select count(*) from inserted_repairs) <> 2 then
    raise exception 'Expected exactly two inserted scans';
  end if;

  if (select count(*)
      from public.production_piece_rate_logs l
      join inserted_repairs r on r.log_id = l.id
      join public.production_stock_movements m on m.id = l.stock_movement_id
      where l.request_id = r.request_id
        and l.doc_no = r.doc_no
        and l.product_goods_code_snapshot = 'B03-0003'
        and l.product_barcode_snapshot = '8852681022640'
        and l.lot_no = '2909260003-1'
        and l.source = 'piece_rate_scan'
        and l.input_value = 5
        and l.count_value_snapshot = 1
        and l.normalized_kg_amount_snapshot = 5
        and l.wage_amount_snapshot = 22.5
        and l.machine_code = 'P02'
        and l.metadata->>'workDate' = '2026-09-29'
        and l.metadata #>> '{historicalBackfill,confirmedWeightKg}' = '5.000'
        and m.movement_type = 'receipt_in'
        and m.movement_date = date '2026-09-29'
        and m.product_code = 'B03-0003'
        and m.lot_no = '2909260003-1'
        and m.quantity_in = 1
        and m.weight_in_kg = 5) <> 2 then
    raise exception 'Inserted scan or receipt verification failed';
  end if;

  if (select count(*)
      from (
        select
          t.employee_code,
          count(l.id) as active_count,
          sum(l.count_value_snapshot) as total_count,
          round(sum(l.normalized_kg_amount_snapshot)::numeric, 3) as total_weight
        from repair_targets t
        join public.production_piece_rate_logs l on l.employee_code = t.employee_code
        where (l.actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
          and (l.doc_status = 'active' or l.doc_status is null)
          and l.replaced_by_log_id is null
        group by t.employee_code
      ) totals
      where (employee_code = 'KPF-01710.' and active_count = 33 and total_count = 33 and total_weight = 165.100)
         or (employee_code = '02051' and active_count = 25 and total_count = 25 and total_weight = 125.070)) <> 2 then
    raise exception 'Final employee totals verification failed';
  end if;
end;
$$;

select
  l.doc_no,
  l.employee_code,
  l.employee_name_snapshot,
  l.product_goods_code_snapshot,
  l.lot_no,
  l.input_value,
  l.count_value_snapshot,
  l.normalized_kg_amount_snapshot,
  l.wage_amount_snapshot,
  l.source,
  m.movement_date,
  m.quantity_in,
  m.weight_in_kg
from public.production_piece_rate_logs l
join inserted_repairs r on r.log_id = l.id
join public.production_stock_movements m on m.id = l.stock_movement_id
order by l.doc_no;

\if :APPLY
commit;
\else
rollback;
\endif
