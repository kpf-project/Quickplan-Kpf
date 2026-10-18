begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temp table before_log as
select * from public.production_piece_rate_logs where doc_no = '20260922080' for update;
create temp table before_movement as
select m.* from public.production_stock_movements m
join before_log l on l.stock_movement_id = m.id for update;
do $$
begin
  if (select count(*) from before_log) <> 1 or not exists (
    select 1 from before_log where id = '7e3359a2-1936-4a5e-b644-e123e5dbf371'
    and employee_code = '02222' and doc_status = 'active'
    and product_code_snapshot = 'WKB-0067' and normalized_kg_amount_snapshot = 17.545
    and (logged_at at time zone 'Asia/Bangkok')::date = date '2026-09-22'
  ) then raise exception 'Document precondition failed'; end if;
  if (select count(*) from before_movement) <> 1 or not exists (
    select 1 from before_movement where product_code = 'WKB-0067'
    and movement_type = 'receipt_in' and source_document_no = '20260922080'
    and weight_in_kg = 17.545
  ) then raise exception 'Movement precondition failed'; end if;
  if not exists (
    select 1 from public.products_cache p
    join public.production_piece_rate_product_mappings pm on pm.product_code = p.sku_code
    join before_log l on l.piece_rate_profile_id = pm.profile_id
    join public.pallet_trade_code_barcodes b on b.goods_code = p.sku_code
    where p.sku_code = 'WKB-0066' and p.sku_name = 'เนื้อขนมบีเวอร์ป้ายแยมสตรอ'
    and p.uom_name = l.product_unit_snapshot and p.is_active
    and b.product_barcode = '0400000003177'
  ) then raise exception 'Target product precondition failed'; end if;
  if exists (select 1 from public.production_piece_rate_stock_issues i join before_log l on l.id = i.piece_rate_log_id)
    or exists (select 1 from public.production_piece_rate_stock_returns r join before_log l on l.id = r.piece_rate_log_id)
  then raise exception 'Downstream documents exist'; end if;
end $$;
\if :APPLY
\copy (select jsonb_build_object('log', (select to_jsonb(l) from before_log l), 'movement', (select to_jsonb(m) from before_movement m))) to '.backups/piece-rate-20260922080-product-before.json'
\endif
update public.production_piece_rate_logs
set product_code_snapshot = 'WKB-0066', product_goods_code_snapshot = 'WKB-0066',
    product_sku_code_snapshot = 'WKB-0066', product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสตรอ',
    product_barcode_snapshot = '0400000003177'
where id in (select id from before_log);
update public.production_stock_movements
set product_code = 'WKB-0066', product_name_snapshot = 'เนื้อขนมบีเวอร์ป้ายแยมสตรอ',
    metadata = jsonb_set(metadata, '{goodsCode}', '"WKB-0066"'::jsonb)
where id in (select id from before_movement);
insert into public.production_piece_rate_log_revisions (log_id, action, before_data, after_data, edited_by, edit_reason)
select b.id, 'update', to_jsonb(b), to_jsonb(l), null,
  'ผู้ใช้ขอเปลี่ยนเฉพาะสินค้าจาก WKB-0067 เป็น WKB-0066 คง LOT น้ำหนัก ค่าแรง เวลา และข้อมูลอื่นเดิม'
from before_log b join public.production_piece_rate_logs l on l.id = b.id;
do $$
begin
  if exists (
    select 1 from before_log b join public.production_piece_rate_logs l on l.id = b.id
    where to_jsonb(l) - array['product_code_snapshot','product_goods_code_snapshot','product_sku_code_snapshot','product_name_snapshot','product_barcode_snapshot']
      is distinct from to_jsonb(b) - array['product_code_snapshot','product_goods_code_snapshot','product_sku_code_snapshot','product_name_snapshot','product_barcode_snapshot']
      or l.product_code_snapshot <> 'WKB-0066'
  ) then raise exception 'Unrelated document data changed'; end if;
  if exists (
    select 1 from before_movement b join public.production_stock_movements m on m.id = b.id
    where to_jsonb(m) - array['product_code','product_name_snapshot','metadata','updated_at']
      is distinct from to_jsonb(b) - array['product_code','product_name_snapshot','metadata','updated_at']
      or m.metadata is distinct from jsonb_set(b.metadata, '{goodsCode}', '"WKB-0066"'::jsonb)
      or m.product_code <> 'WKB-0066'
  ) then raise exception 'Unrelated movement data changed'; end if;
end $$;
select doc_no, employee_code, product_code_snapshot, product_name_snapshot,
  normalized_kg_amount_snapshot, wage_amount_snapshot, logged_at, lot_no
from public.production_piece_rate_logs where id in (select id from before_log);
\if :APPLY
commit;
\else
rollback;
\endif
