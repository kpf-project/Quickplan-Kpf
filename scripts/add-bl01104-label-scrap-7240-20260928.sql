-- Add the operator-confirmed 7.240 kg label scrap for BL0-1104 on Sep 28.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('piece-rate-waste|2026-09-28|BL0-1104|label_scrap', 0));

do $$
declare
  v_weight numeric;
  v_waste_count integer;
begin
  select sum(normalized_kg_amount_snapshot)
  into v_weight
  from public.production_piece_rate_logs
  where coalesce(product_goods_code_snapshot, product_code_snapshot) = 'BL0-1104'
    and actual_weighed_at >= timestamptz '2026-09-27 17:00:00+00'
    and actual_weighed_at < timestamptz '2026-09-28 17:00:00+00'
    and doc_status = 'active';

  if v_weight <> 1729.200 then
    raise exception 'BL0-1104 Sep 28 production weight precondition failed: %', v_weight;
  end if;

  select count(*)
  into v_waste_count
  from public.production_piece_rate_waste_logs
  where coalesce(product_goods_code_snapshot, product_code_snapshot) = 'BL0-1104'
    and actual_weighed_at >= timestamptz '2026-09-27 17:00:00+00'
    and actual_weighed_at < timestamptz '2026-09-28 17:00:00+00'
    and status = 'confirmed';

  if v_waste_count <> 0 then
    raise exception 'Existing confirmed BL0-1104 Sep 28 waste found: % rows', v_waste_count;
  end if;

  if exists (
    select 1 from public.production_piece_rate_waste_logs
    where request_id = 'data-correction-bl0-1104-label-scrap-20260928-7.240'
  ) then
    raise exception 'Correction request already exists; no data changed';
  end if;
end $$;

\if :APPLY
\copy (select to_jsonb(l) from public.production_piece_rate_logs l where l.id = '10588a0b-54f6-40f7-9f60-3169df32de65') to '.backups/bl01104-label-scrap-7240-20260928-before.json'
\endif

with source_product as (
  select *
  from public.production_piece_rate_logs
  where coalesce(product_goods_code_snapshot, product_code_snapshot) = 'BL0-1104'
    and actual_weighed_at >= timestamptz '2026-09-27 17:00:00+00'
    and actual_weighed_at < timestamptz '2026-09-28 17:00:00+00'
    and doc_status = 'active'
  order by actual_weighed_at, id
  limit 1
)
insert into public.production_piece_rate_waste_logs (
  request_id,
  product_barcode_snapshot,
  product_code_snapshot,
  product_goods_code_snapshot,
  product_sku_code_snapshot,
  product_name_snapshot,
  product_brand_code_snapshot,
  product_brand_name_snapshot,
  product_unit_snapshot,
  waste_weight_kg,
  machine_code,
  raw_product_barcode_payload,
  actual_weighed_at,
  operator_user_id,
  status,
  metadata,
  waste_category
)
select
  'data-correction-bl0-1104-label-scrap-20260928-7.240',
  product_barcode_snapshot,
  product_code_snapshot,
  product_goods_code_snapshot,
  product_sku_code_snapshot,
  product_name_snapshot,
  product_brand_code_snapshot,
  product_brand_name_snapshot,
  product_unit_snapshot,
  7.240,
  machine_code,
  product_barcode_snapshot,
  actual_weighed_at,
  operator_user_id,
  'confirmed',
  jsonb_build_object(
    'source', 'operator_confirmed_data_correction',
    'reason', 'ผู้ใช้ยืนยันของเสียประเภทป้าย 7.240 กก. สำหรับ BL0-1104 วันที่ 2026-09-28',
    'sourcePieceRateLogId', id,
    'sourceDocumentNo', doc_no
  ),
  'label_scrap'
from source_product;

insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select
  operator_user_id,
  'production-piece-rate-waste.add-data-correction',
  'production_piece_rate_waste_logs',
  id,
  jsonb_build_object(
    'reason', 'ผู้ใช้ยืนยันของเสียประเภทป้าย 7.240 กก. สำหรับ BL0-1104 วันที่ 2026-09-28',
    'after', to_jsonb(w)
  )
from public.production_piece_rate_waste_logs w
where request_id = 'data-correction-bl0-1104-label-scrap-20260928-7.240';

do $$
declare
  v_label_scrap numeric;
begin
  select sum(waste_weight_kg)
  into v_label_scrap
  from public.production_piece_rate_waste_logs
  where coalesce(product_goods_code_snapshot, product_code_snapshot) = 'BL0-1104'
    and actual_weighed_at >= timestamptz '2026-09-27 17:00:00+00'
    and actual_weighed_at < timestamptz '2026-09-28 17:00:00+00'
    and waste_category = 'label_scrap'
    and status = 'confirmed';

  if v_label_scrap <> 7.240 then
    raise exception 'BL0-1104 Sep 28 label scrap verification failed: %', v_label_scrap;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select request_id, product_goods_code_snapshot, waste_category,
       waste_weight_kg, actual_weighed_at, status
from public.production_piece_rate_waste_logs
where request_id = 'data-correction-bl0-1104-label-scrap-20260928-7.240';
