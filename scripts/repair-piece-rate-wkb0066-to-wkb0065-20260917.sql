begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table target_logs as
select *
from public.production_piece_rate_logs
where doc_no = any (array[
  '20260917008', '20260917009', '20260917013', '20260917027'
])
for update;

create temp table target_movements as
select m.*
from public.production_stock_movements m
join target_logs l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from target_logs) <> 4 then
    raise exception 'Expected exactly four piece-rate logs';
  end if;

  if exists (
    select 1 from target_logs
    where doc_status <> 'active'
       or product_code_snapshot <> 'WKB-0066'
       or product_goods_code_snapshot <> 'WKB-0066'
       or product_sku_code_snapshot <> 'WKB-0066'
       or product_name_snapshot <> 'เนื้อขนมบีเวอร์ป้ายแยมสตรอ'
       or product_barcode_snapshot <> '0400000003177'
       or raw_product_barcode_payload <> '0400000003177'
       or lot_no <> '1709260066-1'
       or piece_rate_profile_id <> 'b0aa8448-cf06-4793-abdd-f41f6ab7070c'::uuid
       or pay_rate_per_kg_snapshot <> 4.5
  ) then
    raise exception 'A target piece-rate log changed; refusing repair';
  end if;

  if (select count(*) from target_movements) <> 4 then
    raise exception 'Expected exactly four linked stock movements';
  end if;

  if exists (
    select 1
    from target_movements m
    join target_logs l on l.stock_movement_id = m.id
    where m.movement_type <> 'receipt_in'
       or m.movement_date <> date '2026-09-17'
       or m.source_document_no <> l.doc_no
       or m.product_code <> 'WKB-0066'
       or m.product_name_snapshot <> 'เนื้อขนมบีเวอร์ป้ายแยมสตรอ'
       or m.lot_no <> '1709260066-1'
       or m.quantity_in <> 1
       or m.quantity_out <> 0
       or m.weight_in_kg <> l.normalized_kg_amount_snapshot
       or m.weight_out_kg <> 0
  ) then
    raise exception 'A linked stock movement changed; refusing repair';
  end if;

  if not exists (
    select 1
    from public.products_cache p
    join public.production_piece_rate_product_mappings pm
      on pm.product_code = p.sku_code or pm.sku_code = p.sku_code
    join public.production_piece_rate_profiles pr on pr.id = pm.profile_id
    join public.pallet_trade_code_barcodes b
      on b.goods_code = pm.product_code and b.sku_code = p.sku_code
    where p.sku_code = 'WKB-0065'
      and p.sku_name = 'เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด'
      and p.uom_name = 'KG'
      and p.is_active
      and pm.profile_id = 'b0aa8448-cf06-4793-abdd-f41f6ab7070c'::uuid
      and pr.input_mode = 'kg'
      and pr.wage_basis = 'kg'
      and pr.pay_rate_per_kg = 4.5
      and b.product_barcode = '0400000003153'
  ) then
    raise exception 'WKB-0065 master data changed; refusing repair';
  end if;

  if exists (
    select 1
    from public.production_piece_rate_stock_issues i
    join target_logs l on l.id = i.piece_rate_log_id
  ) or exists (
    select 1
    from public.production_piece_rate_stock_returns r
    join target_logs l on l.id = r.piece_rate_log_id
  ) then
    raise exception 'A target document has downstream issue or return rows';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('logs', (select jsonb_agg(to_jsonb(l)) from target_logs l), 'movements', (select jsonb_agg(to_jsonb(m)) from target_movements m))) to '.backups/piece-rate-wkb0066-to-wkb0065-20260917-before.json'
\endif

update public.production_piece_rate_logs l
set product_code_snapshot = 'WKB-0065',
    product_goods_code_snapshot = 'WKB-0065',
    product_sku_code_snapshot = 'WKB-0065',
    product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด',
    product_barcode_snapshot = '0400000003153',
    raw_product_barcode_payload = '0400000003153',
    lot_no = '1709260065-1',
    metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
      'productCorrection20260918', jsonb_build_object(
        'fromProductCode', 'WKB-0066',
        'toProductCode', 'WKB-0065',
        'reason', 'ผู้ใช้งานยืนยันว่าเลือกสินค้าผิดในเอกสารวันที่ 17/09/2569',
        'correctedAt', now()
      )
    )
where l.id in (select id from target_logs);

update public.production_stock_movements m
set product_code = 'WKB-0065',
    product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด',
    lot_no = '1709260065-1',
    metadata = jsonb_set(
      jsonb_set(
        coalesce(m.metadata, '{}'::jsonb),
        '{goodsCode}',
        to_jsonb('WKB-0065'::text),
        true
      ),
      '{lotNo}',
      to_jsonb('1709260065-1'::text),
      true
    ) || jsonb_build_object(
      'productCorrection20260918', jsonb_build_object(
        'fromProductCode', 'WKB-0066',
        'toProductCode', 'WKB-0065',
        'reason', 'แก้ตามเอกสารสแกนค่าแรงต้นทาง',
        'correctedAt', now()
      )
    )
where m.id in (select id from target_movements);

insert into public.production_piece_rate_log_revisions (
  log_id,
  action,
  before_data,
  after_data,
  edited_by,
  edit_reason
)
select
  before_row.id,
  'update',
  to_jsonb(before_row),
  to_jsonb(after_row),
  null,
  'แก้สินค้าที่เลือกผิดจาก WKB-0066 เป็น WKB-0065 ตามการยืนยันของผู้ใช้งาน'
from target_logs before_row
join public.production_piece_rate_logs after_row on after_row.id = before_row.id;

do $$
begin
  if (
    select count(*)
    from public.production_piece_rate_logs l
    join target_logs before_row on before_row.id = l.id
    join public.production_stock_movements m on m.id = l.stock_movement_id
    where l.product_code_snapshot = 'WKB-0065'
      and l.product_goods_code_snapshot = 'WKB-0065'
      and l.product_sku_code_snapshot = 'WKB-0065'
      and l.product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด'
      and l.product_barcode_snapshot = '0400000003153'
      and l.raw_product_barcode_payload = '0400000003153'
      and l.lot_no = '1709260065-1'
      and l.employee_code = before_row.employee_code
      and l.employee_name_snapshot is not distinct from before_row.employee_name_snapshot
      and l.input_value = before_row.input_value
      and l.normalized_kg_amount_snapshot = before_row.normalized_kg_amount_snapshot
      and l.wage_amount_snapshot = before_row.wage_amount_snapshot
      and m.product_code = 'WKB-0065'
      and m.product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด'
      and m.lot_no = '1709260065-1'
      and m.weight_in_kg = before_row.normalized_kg_amount_snapshot
  ) <> 4 then
    raise exception 'Product correction verification failed';
  end if;
end;
$$;

select
  l.doc_no,
  l.employee_code,
  l.employee_name_snapshot,
  l.product_code_snapshot,
  l.product_name_snapshot,
  l.lot_no,
  l.normalized_kg_amount_snapshot,
  l.wage_amount_snapshot,
  m.product_code as movement_product_code,
  m.lot_no as movement_lot_no,
  m.weight_in_kg
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.doc_no = any (array[
  '20260917008', '20260917009', '20260917013', '20260917027'
])
order by l.doc_no;

\if :APPLY
commit;
\else
rollback;
\endif
