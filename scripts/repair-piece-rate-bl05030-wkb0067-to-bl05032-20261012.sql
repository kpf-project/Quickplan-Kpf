begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table target_logs as
select *
from public.production_piece_rate_logs
where doc_no = any (array[
  -- 29 documents of BL0-5030 (145.085 kg)
  '20261012038', '20261012039', '20261012040', '20261012042', '20261012044',
  '20261012047', '20261012051', '20261012052', '20261012054', '20261012058',
  '20261012059', '20261012060', '20261012063', '20261012064', '20261012068',
  '20261012072', '20261012075', '20261012076', '20261012078', '20261012079',
  '20261012084', '20261012085', '20261012089', '20261012090', '20261012091',
  '20261012092', '20261012093', '20261012094', '20261012101',
  -- 14 documents of WKB-0067 (203.050 kg)
  '20261012011', '20261012012', '20261012013', '20261012014', '20261012018',
  '20261012027', '20261012028', '20261012029', '20261012030', '20261012031',
  '20261012120', '20261012121', '20261012122', '20261012123'
])
for update;

create temp table target_movements as
select m.*
from public.production_stock_movements m
join target_logs l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from target_logs) <> 43 then
    raise exception 'Expected exactly 43 piece-rate logs, found %', (select count(*) from target_logs);
  end if;

  if (select count(*) from target_logs where product_code_snapshot = 'BL0-5030') <> 29 then
    raise exception 'Expected exactly 29 BL0-5030 piece-rate logs';
  end if;

  if (select count(*) from target_logs where product_code_snapshot = 'WKB-0067') <> 14 then
    raise exception 'Expected exactly 14 WKB-0067 piece-rate logs';
  end if;

  if round((select coalesce(sum(normalized_kg_amount_snapshot), 0) from target_logs where product_code_snapshot = 'BL0-5030')::numeric, 3) <> 145.085 then
    raise exception 'BL0-5030 weight precondition failed (expected 145.085)';
  end if;

  if round((select coalesce(sum(normalized_kg_amount_snapshot), 0) from target_logs where product_code_snapshot = 'WKB-0067')::numeric, 3) <> 203.050 then
    raise exception 'WKB-0067 weight precondition failed (expected 203.050)';
  end if;

  if exists (
    select 1 from target_logs
    where doc_status <> 'active'
       or replaced_by_log_id is not null
  ) then
    raise exception 'A target piece-rate log has unexpected status or replacement';
  end if;

  if (select count(*) from target_movements) <> 43 then
    raise exception 'Expected exactly 43 linked stock movements, found %', (select count(*) from target_movements);
  end if;

  if not exists (
    select 1
    from public.products_cache p
    where p.sku_code = 'BL0-5032'
      and p.sku_name = 'ขนมปังกรอบ แยมสตรอเบอร์รี่ 5 กก. (1ถุง)'
      and p.is_active
  ) then
    raise exception 'Target product BL0-5032 precondition failed';
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
\copy (select jsonb_build_object('logs', (select jsonb_agg(to_jsonb(l)) from target_logs l), 'movements', (select jsonb_agg(to_jsonb(m)) from target_movements m))) to '.backups/piece-rate-20261012-bl05030-wkb0067-to-bl05032-before.json'
\endif

update public.production_piece_rate_logs l
set product_code_snapshot = 'BL0-5032',
    product_goods_code_snapshot = 'BL0-5032',
    product_sku_code_snapshot = 'BL0-5032',
    product_name_snapshot = 'ขนมปังกรอบ แยมสตรอเบอร์รี่ 5 กก. (1ถุง)',
    product_brand_code_snapshot = 'KL',
    product_brand_name_snapshot = 'ระฆังทอง',
    product_unit_snapshot = 'กล่อง*1ถุง',
    lot_no = '1210265032-1',
    metadata = coalesce(l.metadata, '{}'::jsonb) || jsonb_build_object(
      'productCorrection20261015', jsonb_build_object(
        'fromProductCode', l.product_code_snapshot,
        'toProductCode', 'BL0-5032',
        'fromLotNo', l.lot_no,
        'toLotNo', '1210265032-1',
        'reason', 'รวมผลผลิต BL0-5030 (145.085 กก.) และ WKB-0067 (203.05 กก.) วันที่ 12/10/2569 เป็น BL0-5032 (348.135 กก.) ตามคำขอผู้ใช้งาน',
        'correctedAt', now()
      )
    )
where l.id in (select id from target_logs);

update public.production_stock_movements m
set product_code = 'BL0-5032',
    product_name_snapshot = 'ขนมปังกรอบ แยมสตรอเบอร์รี่ 5 กก. (1ถุง)',
    uom_name = 'กล่อง*1ถุง',
    lot_no = '1210265032-1',
    metadata = jsonb_set(
      jsonb_set(
        coalesce(m.metadata, '{}'::jsonb),
        '{goodsCode}',
        to_jsonb('BL0-5032'::text),
        true
      ),
      '{lotNo}',
      to_jsonb('1210265032-1'::text),
      true
    ) || jsonb_build_object(
      'productCorrection20261015', jsonb_build_object(
        'fromProductCode', m.product_code,
        'toProductCode', 'BL0-5032',
        'fromLotNo', m.lot_no,
        'toLotNo', '1210265032-1',
        'reason', 'แก้ตามเอกสารสแกนค่าแรงต้นทางที่รวมเป็น BL0-5032',
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
  b.id,
  'update',
  to_jsonb(b),
  to_jsonb(l),
  null,
  'รวมผลผลิต BL0-5030 และ WKB-0067 วันที่ 12/10/2569 เป็น BL0-5032 ขนมปังกรอบ แยมสตรอเบอร์รี่ 5 กก. (1ถุง) ตามคำขอผู้ใช้งาน'
from target_logs b
join public.production_piece_rate_logs l on l.id = b.id;

do $$
begin
  if exists (
    select 1
    from target_logs b
    join public.production_piece_rate_logs l on l.id = b.id
    where to_jsonb(l) - array[
      'product_code_snapshot', 'product_goods_code_snapshot',
      'product_sku_code_snapshot', 'product_name_snapshot',
      'product_brand_code_snapshot', 'product_brand_name_snapshot',
      'product_unit_snapshot', 'lot_no', 'metadata'
    ] is distinct from to_jsonb(b) - array[
      'product_code_snapshot', 'product_goods_code_snapshot',
      'product_sku_code_snapshot', 'product_name_snapshot',
      'product_brand_code_snapshot', 'product_brand_name_snapshot',
      'product_unit_snapshot', 'lot_no', 'metadata'
    ]
      or l.product_code_snapshot <> 'BL0-5032'
      or l.product_goods_code_snapshot <> 'BL0-5032'
      or l.product_sku_code_snapshot <> 'BL0-5032'
      or l.lot_no <> '1210265032-1'
  ) then
    raise exception 'Unrelated document data changed';
  end if;

  if exists (
    select 1
    from target_movements b
    join public.production_stock_movements m on m.id = b.id
    where to_jsonb(m) - array[
      'product_code', 'product_name_snapshot', 'uom_name',
      'lot_no', 'metadata', 'updated_at'
    ] is distinct from to_jsonb(b) - array[
      'product_code', 'product_name_snapshot', 'uom_name',
      'lot_no', 'metadata', 'updated_at'
    ]
      or m.product_code <> 'BL0-5032'
      or m.lot_no <> '1210265032-1'
  ) then
    raise exception 'Unrelated movement data changed';
  end if;
end;
$$;

-- Verification summary
select
  count(*) as total_updated_docs,
  round(sum(l.normalized_kg_amount_snapshot)::numeric, 3) as total_weight_kg,
  l.product_code_snapshot as new_product_code,
  l.product_name_snapshot as new_product_name,
  l.lot_no as new_lot_no,
  m.product_code as movement_product_code,
  m.lot_no as movement_lot_no
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.id in (select id from target_logs)
group by l.product_code_snapshot, l.product_name_snapshot, l.lot_no, m.product_code, m.lot_no;

\if :APPLY
commit;
\else
rollback;
\endif
