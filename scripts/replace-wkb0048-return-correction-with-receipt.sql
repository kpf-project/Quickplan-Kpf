-- Replace the approved 14.690 kg floating correction with one traceable return receipt.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_candidate_count integer;
  v_correction_count integer;
  v_ready_count integer;
  v_ready_weight numeric;
begin
  select count(*) into v_candidate_count
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id = i.issue_document_id
  where i.id = '1f865560-6bdb-442f-a218-6a9e0b129d23'
    and i.source_receipt_id = '1fc38836-abf6-4a15-8828-5f9b3aa59866'
    and i.barcode = '27082600480135'
    and i.product_code = 'WKB-0048'
    and i.lot_no = '2708260048-1'
    and i.weight_kg = 15.080
    and i.status = 'confirmed'
    and d.issue_date = '2026-09-03'
    and d.status = 'confirmed'
    and not exists (
      select 1 from public.production_stock_movements m
      where m.movement_type in ('return_in', 'waste_out')
        and m.metadata ->> 'sourceIssueItemId' = i.id::text
    );

  if v_candidate_count <> 1 then
    raise exception 'Source issue precondition failed; no data changed';
  end if;

  select count(*) into v_correction_count
  from public.production_stock_movements
  where movement_no = 'MVCOR-20260903-WKB0048-14690'
    and metadata ->> 'correctionKey' = 'WKB0048-2708260048-1-20260903-RETURN-14690'
    and movement_type = 'return_in'
    and movement_date = '2026-09-03'
    and product_code = 'WKB-0048'
    and lot_no = '2708260048-1'
    and weight_in_kg = 14.690;

  if v_correction_count <> 1 then
    raise exception 'Floating correction precondition failed; no data changed';
  end if;

  if exists (select 1 from public.production_weight_receipts where barcode = '27082600480135X01') then
    raise exception 'Return barcode already exists; no data changed';
  end if;

  select count(*), coalesce(sum(r.net_weight_kg), 0)
  into v_ready_count, v_ready_weight
  from public.production_weight_receipts r
  join public.production_weight_scale_lots l on l.id = r.lot_id
  join public.production_weight_scale_products c on c.id = r.product_config_id
  where c.sku_code = 'WKB-0048'
    and l.lot_code = '2708260048-1'
    and r.status = 'recorded'
    and not exists (
      select 1
      from public.production_stock_issue_items i
      join public.production_stock_issue_documents d on d.id = i.issue_document_id
      where i.source_receipt_id = r.id
        and i.status = 'confirmed'
        and d.status = 'confirmed'
    );

  if v_ready_count <> 8 or v_ready_weight <> 108.410 then
    raise exception 'Ready-stock precondition failed: count %, weight %', v_ready_count, v_ready_weight;
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('issue_item',(select to_jsonb(i) from public.production_stock_issue_items i where i.id='1f865560-6bdb-442f-a218-6a9e0b129d23'),'source_receipt',(select to_jsonb(r) from public.production_weight_receipts r where r.id='1fc38836-abf6-4a15-8828-5f9b3aa59866'),'floating_correction',(select to_jsonb(m) from public.production_stock_movements m where m.movement_no='MVCOR-20260903-WKB0048-14690'))) to '.backups/wkb0048-return-receipt-14690-before.json'
\endif

create temp table created_return as
select public.create_production_stock_return(
  '27082600480135',
  17.490,
  2.800,
  'source_receipt',
  null,
  'ซ่อมประวัติชั่งคืน 14.690 กก. แทนยอดปรับลอยที่ตรวจสอบย้อนกลับไม่ได้'
) result;

update public.production_weight_receipts r
set weighed_at = timestamptz '2026-09-03 23:59:59+07',
    metadata = r.metadata || jsonb_build_object(
      'productionDate', '2026-09-03',
      'shift', '2',
      'historicalRepair', true,
      'historicalRepairKey', 'WKB0048-2708260048-1-20260903-RETURN-14690',
      'weighedAtEstimated', true,
      'replacesMovementNo', 'MVCOR-20260903-WKB0048-14690'
    )
from created_return c
where r.id = (c.result ->> 'id')::uuid;

update public.production_stock_movements m
set movement_date = '2026-09-03',
    movement_at = timestamptz '2026-09-03 23:59:59+07',
    metadata = m.metadata || jsonb_build_object(
      'productionDate', '2026-09-03',
      'shift', '2',
      'historicalRepair', true,
      'historicalRepairKey', 'WKB0048-2708260048-1-20260903-RETURN-14690',
      'movementAtEstimated', true,
      'replacesMovementNo', 'MVCOR-20260903-WKB0048-14690'
    )
from created_return c
where m.movement_no = c.result ->> 'movementNo';

delete from public.production_stock_movements
where movement_no = 'MVCOR-20260903-WKB0048-14690'
  and metadata ->> 'correctionKey' = 'WKB0048-2708260048-1-20260903-RETURN-14690';

do $$
declare
  v_ready_count integer;
  v_ready_weight numeric;
  v_return_weight numeric;
begin
  if not exists (
    select 1
    from public.production_weight_receipts r
    where r.barcode = '27082600480135X01'
      and r.net_weight_kg = 14.690
      and r.status = 'recorded'
      and r.metadata ->> 'sourceIssueItemId' = '1f865560-6bdb-442f-a218-6a9e0b129d23'
      and r.metadata ->> 'productionDate' = '2026-09-03'
  ) then
    raise exception 'Return receipt verification failed';
  end if;

  if exists (
    select 1 from public.production_stock_movements
    where movement_no = 'MVCOR-20260903-WKB0048-14690'
  ) then
    raise exception 'Floating correction was not removed';
  end if;

  select coalesce(sum(weight_in_kg), 0) into v_return_weight
  from public.production_stock_movements
  where product_code = 'WKB-0048'
    and lot_no = '2708260048-1'
    and movement_date = '2026-09-03'
    and movement_type = 'return_in';

  select count(*), coalesce(sum(r.net_weight_kg), 0)
  into v_ready_count, v_ready_weight
  from public.production_weight_receipts r
  join public.production_weight_scale_lots l on l.id = r.lot_id
  join public.production_weight_scale_products c on c.id = r.product_config_id
  where c.sku_code = 'WKB-0048'
    and l.lot_code = '2708260048-1'
    and r.status = 'recorded'
    and not exists (
      select 1
      from public.production_stock_issue_items i
      join public.production_stock_issue_documents d on d.id = i.issue_document_id
      where i.source_receipt_id = r.id
        and i.status = 'confirmed'
        and d.status = 'confirmed'
    );

  if v_return_weight <> 23.340 or v_ready_count <> 9 or v_ready_weight <> 123.100 then
    raise exception 'Final verification failed: return %, ready count %, ready weight %',
      v_return_weight, v_ready_count, v_ready_weight;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select
  r.barcode,
  r.net_weight_kg,
  r.status,
  r.metadata ->> 'sourceBarcode' source_barcode,
  r.metadata ->> 'productionDate' production_date
from public.production_weight_receipts r
where r.barcode = '27082600480135X01';
