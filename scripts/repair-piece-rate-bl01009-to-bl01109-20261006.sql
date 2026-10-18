begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table before_log as
select *
from public.production_piece_rate_logs
where doc_no in ('20261006068', '20261006069', '20261006070')
for update;

create temp table before_movement as
select m.*
from public.production_stock_movements m
join before_log l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from before_log) <> 3 or not exists (
    select 1
    from before_log
    where doc_no = '20261006068'
      and doc_status = 'active'
      and replaced_by_log_id is null
      and employee_code = 'KPF-00785'
      and input_value = 189
      and normalized_kg_amount_snapshot = 207.9
  ) or not exists (
    select 1
    from before_log
    where doc_no = '20261006069'
      and doc_status = 'active'
      and replaced_by_log_id is null
      and employee_code = 'KPF-00717.'
      and input_value = 212
      and normalized_kg_amount_snapshot = 233.2
  ) or not exists (
    select 1
    from before_log
    where doc_no = '20261006070'
      and doc_status = 'active'
      and replaced_by_log_id is null
      and employee_code = 'KPF-01345'
      and input_value = 198
      and normalized_kg_amount_snapshot = 217.8
  ) then
    raise exception 'Document preconditions failed';
  end if;

  if (select count(*) from before_movement) <> 3 or not exists (
    select 1
    from before_movement
    where movement_type = 'receipt_in'
      and movement_date = date '2026-10-06'
      and source_document_no = '20261006068'
      and weight_in_kg = 207.9
  ) or not exists (
    select 1
    from before_movement
    where movement_type = 'receipt_in'
      and movement_date = date '2026-10-06'
      and source_document_no = '20261006069'
      and weight_in_kg = 233.2
  ) or not exists (
    select 1
    from before_movement
    where movement_type = 'receipt_in'
      and movement_date = date '2026-10-06'
      and source_document_no = '20261006070'
      and weight_in_kg = 217.8
  ) then
    raise exception 'Movement preconditions failed';
  end if;

  if not exists (
    select 1
    from public.products_cache p
    join public.pallet_trade_code_barcodes b
      on (b.goods_code = p.sku_code or b.sku_code = p.sku_code)
    where p.sku_code = 'BL0-1109'
      and p.sku_name = 'ขนมปังกรอบ รสมะพร้าว 1.1กก. (6ปี๊บ)'
      and p.uom_name = 'กล่อง*6ปี๊บ'
      and p.is_active
      and b.product_barcode = '8859771701362'
  ) then
    raise exception 'Target product BL0-1109 precondition failed';
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
\copy (select jsonb_build_object('logs', (select jsonb_agg(to_jsonb(l)) from before_log l), 'movements', (select jsonb_agg(to_jsonb(m)) from before_movement m))) to '.backups/piece-rate-20261006-bl01009-to-bl01109-before.json'
\endif

update public.production_piece_rate_logs l
set product_code_snapshot = 'BL0-1109',
    product_goods_code_snapshot = 'BL0-1109',
    product_sku_code_snapshot = 'BL0-1109',
    product_name_snapshot = 'ขนมปังกรอบ รสมะพร้าว 1.1กก. (6ปี๊บ)',
    product_brand_code_snapshot = 'KL',
    product_brand_name_snapshot = 'ระฆังทอง',
    product_unit_snapshot = 'กล่อง*6ปี๊บ',
    product_barcode_snapshot = '8859771701362',
    raw_product_barcode_payload = '8859771701362',
    lot_no = '0610261109-1',
    metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
      'productCorrection20261007_v2', jsonb_build_object(
        'fromProductCode', l.product_code_snapshot,
        'toProductCode', 'BL0-1109',
        'fromBarcode', l.product_barcode_snapshot,
        'toBarcode', '8859771701362',
        'fromLotNo', l.lot_no,
        'toLotNo', '0610261109-1',
        'reason', 'ผู้ใช้งานแจ้งแก้ไขรหัสสินค้าที่ถูกต้องเป็น BL0-1109 ในเอกสาร 20261006068, 20261006069, 20261006070',
        'correctedAt', now()
      )
    )
where l.id in (select id from before_log);

update public.production_stock_movements m
set product_code = 'BL0-1109',
    product_name_snapshot = 'ขนมปังกรอบ รสมะพร้าว 1.1กก. (6ปี๊บ)',
    uom_name = 'กล่อง*6ปี๊บ',
    lot_no = '0610261109-1',
    metadata = jsonb_set(
      jsonb_set(
        coalesce(m.metadata, '{}'::jsonb),
        '{goodsCode}',
        to_jsonb('BL0-1109'::text),
        true
      ),
      '{lotNo}',
      to_jsonb('0610261109-1'::text),
      true
    ) || jsonb_build_object(
      'productCorrection20261007_v2', jsonb_build_object(
        'fromProductCode', m.product_code,
        'toProductCode', 'BL0-1109',
        'fromLotNo', m.lot_no,
        'toLotNo', '0610261109-1',
        'reason', 'แก้ตามเอกสารสแกนค่าแรงต้นทางที่แก้ไขรหัสสินค้าเป็น BL0-1109',
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
  'แก้สินค้าที่ถูกต้องเป็น BL0-1109 ขนมปังกรอบ รสมะพร้าว 1.1กก. (6ปี๊บ) และบาร์โค้ด 8859771701362 ตามการยืนยันของผู้ใช้งาน'
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
      'product_brand_code_snapshot', 'product_brand_name_snapshot',
      'product_unit_snapshot', 'product_barcode_snapshot',
      'raw_product_barcode_payload', 'lot_no', 'metadata'
    ] is distinct from to_jsonb(b) - array[
      'product_code_snapshot', 'product_goods_code_snapshot',
      'product_sku_code_snapshot', 'product_name_snapshot',
      'product_brand_code_snapshot', 'product_brand_name_snapshot',
      'product_unit_snapshot', 'product_barcode_snapshot',
      'raw_product_barcode_payload', 'lot_no', 'metadata'
    ]
      or l.product_code_snapshot <> 'BL0-1109'
      or l.product_goods_code_snapshot <> 'BL0-1109'
      or l.product_sku_code_snapshot <> 'BL0-1109'
      or l.product_barcode_snapshot <> '8859771701362'
      or l.lot_no <> '0610261109-1'
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
      or m.product_code <> 'BL0-1109'
      or m.lot_no <> '0610261109-1'
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
  m.weight_in_kg
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.doc_no in ('20261006068', '20261006069', '20261006070')
order by l.doc_no;

\if :APPLY
commit;
\else
rollback;
\endif
