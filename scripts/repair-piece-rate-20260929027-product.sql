begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table before_log as
select *
from public.production_piece_rate_logs
where doc_no = '20260929027'
for update;

create temp table before_movement as
select m.*
from public.production_stock_movements m
join before_log l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from before_log) <> 1 or not exists (
    select 1
    from before_log
    where id = '635dcb38-e195-4bb4-a606-73a8f21766c1'::uuid
      and doc_status = 'active'
      and replaced_by_log_id is null
      and employee_code = 'KPF-01271'
      and product_code_snapshot = 'BL0-5001'
      and product_goods_code_snapshot = 'BL0-5001'
      and product_sku_code_snapshot = 'BL0-5001'
      and product_barcode_snapshot = '8852681022367'
      and raw_product_barcode_payload = '8852681022367'
      and lot_no = '2909265001-1'
      and input_value = 5
      and count_value_snapshot = 1
      and normalized_kg_amount_snapshot = 5
      and wage_amount_snapshot = 22.5
      and (actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
  ) then
    raise exception 'Document precondition failed';
  end if;

  if (select count(*) from before_movement) <> 1 or not exists (
    select 1
    from before_movement
    where movement_type = 'receipt_in'
      and movement_date = date '2026-09-29'
      and source_document_no = '20260929027'
      and product_code = 'BL0-5001'
      and lot_no = '2909265001-1'
      and quantity_in = 1
      and weight_in_kg = 5
      and quantity_out = 0
      and weight_out_kg = 0
  ) then
    raise exception 'Movement precondition failed';
  end if;

  if not exists (
    select 1
    from public.products_cache p
    join public.production_piece_rate_product_mappings pm
      on pm.product_code = p.sku_code or pm.sku_code = p.sku_code
    join before_log l on l.piece_rate_profile_id = pm.profile_id
    join public.pallet_trade_code_barcodes b
      on b.goods_code = p.sku_code and b.sku_code = p.sku_code
    where p.sku_code = 'B03-0003'
      and p.sku_name = 'แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)'
      and p.uom_name = 'ปี๊บ/5กก.'
      and p.is_active
      and b.product_barcode = '8852681022640'
  ) then
    raise exception 'Target product precondition failed';
  end if;

  if not exists (
    select 1
    from public.production_piece_rate_logs
    where product_goods_code_snapshot = 'B03-0003'
      and product_barcode_snapshot = '8852681022640'
      and lot_no = '2909260003-1'
      and (doc_status = 'active' or doc_status is null)
      and replaced_by_log_id is null
  ) then
    raise exception 'Target LOT precondition failed';
  end if;

  if exists (
    select 1
    from public.production_piece_rate_stock_issues i
    join before_log l on l.id = i.piece_rate_log_id
  ) or exists (
    select 1
    from public.production_piece_rate_stock_returns r
    join before_log l on l.id = r.piece_rate_log_id
  ) then
    raise exception 'Downstream issue or return exists';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('log', (select to_jsonb(l) from before_log l), 'movement', (select to_jsonb(m) from before_movement m))) to '.backups/piece-rate-20260929027-product-before.json'
\endif

update public.production_piece_rate_logs l
set product_code_snapshot = 'B03-0003',
    product_goods_code_snapshot = 'B03-0003',
    product_sku_code_snapshot = 'B03-0003',
    product_name_snapshot = 'แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)',
    product_unit_snapshot = 'ปี๊บ/5กก.',
    product_barcode_snapshot = '8852681022640',
    raw_product_barcode_payload = '8852681022640',
    lot_no = '2909260003-1',
    metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
      'productCorrection20260930', jsonb_build_object(
        'fromProductCode', 'BL0-5001',
        'toProductCode', 'B03-0003',
        'reason', 'ผู้ใช้งานยืนยันว่าเลือกสินค้าผิดในเอกสาร 20260929027',
        'correctedAt', now()
      )
    )
where l.id in (select id from before_log);

update public.production_stock_movements m
set product_code = 'B03-0003',
    product_name_snapshot = 'แม่มะลิ แยมสับปะรด 5 กก. (1 ปี๊บ)',
    uom_name = 'ปี๊บ/5กก.',
    lot_no = '2909260003-1',
    metadata = jsonb_set(
      jsonb_set(
        coalesce(m.metadata, '{}'::jsonb),
        '{goodsCode}',
        to_jsonb('B03-0003'::text),
        true
      ),
      '{lotNo}',
      to_jsonb('2909260003-1'::text),
      true
    ) || jsonb_build_object(
      'productCorrection20260930', jsonb_build_object(
        'fromProductCode', 'BL0-5001',
        'toProductCode', 'B03-0003',
        'reason', 'แก้ตามเอกสารสแกนค่าแรงต้นทาง',
        'correctedAt', now()
      )
    )
where m.id in (select id from before_movement);

insert into public.production_piece_rate_log_revisions (
  log_id,
  action,
  before_data,
  after_data,
  edited_by,
  edit_reason
)
select
  b.id,
  'update',
  to_jsonb(b),
  to_jsonb(l),
  null,
  'แก้สินค้าที่เลือกผิดจาก BL0-5001 เป็น B03-0003 ตามการยืนยันของผู้ใช้งาน'
from before_log b
join public.production_piece_rate_logs l on l.id = b.id;

do $$
begin
  if exists (
    select 1
    from before_log b
    join public.production_piece_rate_logs l on l.id = b.id
    where to_jsonb(l) - array[
      'product_code_snapshot', 'product_goods_code_snapshot',
      'product_sku_code_snapshot', 'product_name_snapshot',
      'product_unit_snapshot', 'product_barcode_snapshot',
      'raw_product_barcode_payload', 'lot_no', 'metadata'
    ] is distinct from to_jsonb(b) - array[
      'product_code_snapshot', 'product_goods_code_snapshot',
      'product_sku_code_snapshot', 'product_name_snapshot',
      'product_unit_snapshot', 'product_barcode_snapshot',
      'raw_product_barcode_payload', 'lot_no', 'metadata'
    ]
      or l.product_code_snapshot <> 'B03-0003'
      or l.product_goods_code_snapshot <> 'B03-0003'
      or l.product_sku_code_snapshot <> 'B03-0003'
      or l.product_barcode_snapshot <> '8852681022640'
      or l.lot_no <> '2909260003-1'
  ) then
    raise exception 'Unrelated document data changed';
  end if;

  if exists (
    select 1
    from before_movement b
    join public.production_stock_movements m on m.id = b.id
    where to_jsonb(m) - array[
      'product_code', 'product_name_snapshot', 'uom_name',
      'lot_no', 'metadata', 'updated_at'
    ] is distinct from to_jsonb(b) - array[
      'product_code', 'product_name_snapshot', 'uom_name',
      'lot_no', 'metadata', 'updated_at'
    ]
      or m.product_code <> 'B03-0003'
      or m.lot_no <> '2909260003-1'
      or m.quantity_in <> 1
      or m.weight_in_kg <> 5
  ) then
    raise exception 'Unrelated movement data changed';
  end if;
end;
$$;

select
  l.doc_no,
  l.employee_code,
  l.employee_name_snapshot,
  l.product_code_snapshot,
  l.product_name_snapshot,
  l.product_barcode_snapshot,
  l.lot_no,
  l.input_value,
  l.count_value_snapshot,
  l.normalized_kg_amount_snapshot,
  l.wage_amount_snapshot,
  m.product_code as movement_product_code,
  m.lot_no as movement_lot_no,
  m.quantity_in,
  m.weight_in_kg
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.doc_no = '20260929027';

\if :APPLY
commit;
\else
rollback;
\endif
