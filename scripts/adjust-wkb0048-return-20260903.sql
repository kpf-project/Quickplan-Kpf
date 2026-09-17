-- User-approved historical return correction for WKB-0048 / 2708260048-1.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table target_scope as
select distinct
  m.department_id,
  m.department_code,
  m.product_name_snapshot,
  m.category_code,
  m.uom_name
from public.production_stock_movements m
where m.product_code = 'WKB-0048'
  and m.lot_no = '2708260048-1'
  and m.movement_type = 'issue_out';

do $$
declare
  v_issue_weight numeric;
  v_original_return_weight numeric;
  v_existing_count integer;
begin
  if (select count(*) from target_scope) <> 1 then
    raise exception 'Expected exactly one department scope for target LOT';
  end if;

  select coalesce(sum(i.weight_kg), 0)
  into v_issue_weight
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id = i.issue_document_id
  where i.product_code = 'WKB-0048'
    and i.lot_no = '2708260048-1'
    and d.issue_date = '2026-09-03'
    and i.status = 'confirmed'
    and d.status = 'confirmed';

  if v_issue_weight <> 696.350 then
    raise exception 'Issue precondition failed: expected 696.350, got %', v_issue_weight;
  end if;

  select coalesce(sum(m.weight_in_kg), 0)
  into v_original_return_weight
  from public.production_stock_movements m
  where m.product_code = 'WKB-0048'
    and m.lot_no = '2708260048-1'
    and m.movement_date = '2026-09-03'
    and m.movement_type = 'return_in'
    and coalesce(m.metadata ->> 'correctionKey', '') <> 'WKB0048-2708260048-1-20260903-RETURN-14690';

  if v_original_return_weight <> 8.650 then
    raise exception 'Return precondition failed: expected 8.650, got %', v_original_return_weight;
  end if;

  select count(*)
  into v_existing_count
  from public.production_stock_movements m
  where m.metadata ->> 'correctionKey' = 'WKB0048-2708260048-1-20260903-RETURN-14690';

  if v_existing_count > 1 then
    raise exception 'Duplicate correction rows detected';
  end if;

  if v_existing_count = 1 and exists (
    select 1
    from public.production_stock_movements m
    where m.metadata ->> 'correctionKey' = 'WKB0048-2708260048-1-20260903-RETURN-14690'
      and (
        m.movement_type <> 'return_in'
        or m.movement_date <> '2026-09-03'
        or m.product_code <> 'WKB-0048'
        or m.lot_no <> '2708260048-1'
        or m.quantity_in <> 0
        or m.weight_in_kg <> 14.690
        or m.quantity_out <> 0
        or m.weight_out_kg <> 0
      )
  ) then
    raise exception 'Existing correction row does not match the approved values';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('issues',(select jsonb_agg(to_jsonb(x)) from (select i.*,d.issue_no,d.issue_date,d.status document_status from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id where i.product_code='WKB-0048' and i.lot_no='2708260048-1' and d.issue_date='2026-09-03') x),'movements',(select jsonb_agg(to_jsonb(m)) from public.production_stock_movements m where m.product_code='WKB-0048' and m.lot_no='2708260048-1' and m.movement_date='2026-09-03'))) to '.backups/wkb0048-return-correction-20260903-before.json'
\endif

insert into public.production_stock_movements (
  movement_no,
  movement_type,
  movement_date,
  department_id,
  department_code,
  product_code,
  product_name_snapshot,
  category_code,
  lot_no,
  uom_name,
  quantity_in,
  weight_in_kg,
  source_document_type,
  source_document_no,
  reference_type,
  reference_no,
  remark,
  metadata
)
select
  'MVCOR-20260903-WKB0048-14690',
  'return_in',
  '2026-09-03',
  s.department_id,
  s.department_code,
  'WKB-0048',
  s.product_name_snapshot,
  s.category_code,
  '2708260048-1',
  s.uom_name,
  0,
  14.690,
  'manual_return_correction',
  'COR-WKB0048-20260903-14690',
  'stock_reconciliation',
  'WKB0048-2708260048-1-20260903-RETURN-14690',
  'ปรับปรุงน้ำหนักชั่งคืนย้อนหลังตามการตรวจสอบยอดผู้ใช้งาน ไม่แก้ไขรายการเบิกเดิม',
  jsonb_build_object(
    'correctionKey', 'WKB0048-2708260048-1-20260903-RETURN-14690',
    'correctionType', 'historical_return_weight',
    'approvedWeightKg', 14.690,
    'approvedAt', now(),
    'reason', 'User approved correction so net actual use is 673.010 kg; no matching historical barcode was found'
  )
from target_scope s
where not exists (
  select 1
  from public.production_stock_movements m
  where m.metadata ->> 'correctionKey' = 'WKB0048-2708260048-1-20260903-RETURN-14690'
);

do $$
declare
  v_count integer;
  v_return_weight numeric;
  v_actual_weight numeric;
begin
  select count(*), sum(weight_in_kg)
  into v_count, v_return_weight
  from public.production_stock_movements
  where product_code = 'WKB-0048'
    and lot_no = '2708260048-1'
    and movement_date = '2026-09-03'
    and movement_type = 'return_in';

  v_actual_weight := 696.350 - v_return_weight;

  if v_count <> 2 or v_return_weight <> 23.340 or v_actual_weight <> 673.010 then
    raise exception 'Verification failed: count %, return %, actual %', v_count, v_return_weight, v_actual_weight;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select
  round(sum(case when m.movement_type = 'return_in' then m.weight_in_kg else 0 end), 3) return_weight_kg
from public.production_stock_movements m
where m.product_code = 'WKB-0048'
  and m.lot_no = '2708260048-1'
  and m.movement_date = '2026-09-03';
