-- สลับ weight_kg ระหว่างแยมสตรอเบอรี่ PJST3 (M04-0126-1) และแยมบลูเบอรี่ PJBY1 (M04-0127-1)
-- วันที่ 2026-10-01: บันทึกสลับกัน 110 kg ↔ 380 kg
-- ค่าที่ถูกต้อง: PJST3 = 110 kg, PJBY1 = 380 kg
-- Dry-run by default; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- advisory lock กันแก้พร้อมกัน
select pg_advisory_xact_lock(hashtextextended('jam-usage-swap|2026-10-01|PJST3-PJBY1', 0));

-- ---- ค้นหา id ของ 2 record ที่ต้อง swap ----
do $$
declare
  v_pjst3_id uuid;
  v_pjby1_id uuid;
  v_pjst3_weight numeric;
  v_pjby1_weight numeric;
begin
  -- ค้นหา record แยมสตรอเบอรี่ PJST3 วันที่ 1 ต.ค. 69
  select id, weight_kg
    into v_pjst3_id, v_pjst3_weight
    from public.production_jam_usage_entries
   where usage_date = date '2026-10-01'
     and goods_code = 'M04-0126-1'
     and status = 'confirmed'
     and voided_at is null
   order by created_at desc
   limit 1;

  if v_pjst3_id is null then
    raise exception 'ไม่พบ record แยมสตรอเบอรี่ PJST3 (M04-0126-1) วันที่ 2026-10-01 ที่ status=confirmed';
  end if;

  -- ค้นหา record แยมบลูเบอรี่ PJBY1 วันที่ 1 ต.ค. 69
  select id, weight_kg
    into v_pjby1_id, v_pjby1_weight
    from public.production_jam_usage_entries
   where usage_date = date '2026-10-01'
     and goods_code = 'M04-0127-1'
     and status = 'confirmed'
     and voided_at is null
   order by created_at desc
   limit 1;

  if v_pjby1_id is null then
    raise exception 'ไม่พบ record แยมบลูเบอรี่ PJBY1 (M04-0127-1) วันที่ 2026-10-01 ที่ status=confirmed';
  end if;

  -- ตรวจสอบว่าค่าปัจจุบันสลับกันจริง (PJST3 ควรเป็น 380, PJBY1 ควรเป็น 110)
  if v_pjst3_weight != 380.000 then
    raise exception 'PJST3 weight_kg ปัจจุบัน = % ไม่ตรงกับที่คาด (380 kg); หยุดไม่แก้ข้อมูล', v_pjst3_weight;
  end if;

  if v_pjby1_weight != 110.000 then
    raise exception 'PJBY1 weight_kg ปัจจุบัน = % ไม่ตรงกับที่คาด (110 kg); หยุดไม่แก้ข้อมูล', v_pjby1_weight;
  end if;

  raise notice 'PJST3 id=% weight=% kg → จะแก้เป็น 110 kg', v_pjst3_id, v_pjst3_weight;
  raise notice 'PJBY1 id=% weight=% kg → จะแก้เป็น 380 kg', v_pjby1_id, v_pjby1_weight;
end $$;

-- ---- backup ก่อน apply ----
\if :APPLY
\copy (
  select to_jsonb(j)
  from public.production_jam_usage_entries j
  where usage_date = date '2026-10-01'
    and goods_code in ('M04-0126-1', 'M04-0127-1')
    and status = 'confirmed'
    and voided_at is null
) to '.backups/swap-jam-pjst3-pjby1-20261001-before.json'
\endif

-- ---- audit log ----
insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select
  created_by,
  'production-jam-usage.swap-weight-correction',
  'production_jam_usage_entries',
  id,
  jsonb_build_object(
    'reason', 'บันทึกน้ำหนักสลับกันระหว่าง PJST3 และ PJBY1 วันที่ 2026-10-01; swap กลับให้ถูกต้อง',
    'before', to_jsonb(j)
  )
from public.production_jam_usage_entries j
where usage_date = date '2026-10-01'
  and goods_code in ('M04-0126-1', 'M04-0127-1')
  and status = 'confirmed'
  and voided_at is null;

-- ---- swap weight_kg ----
-- PJST3: 380 → 110
update public.production_jam_usage_entries
set weight_kg = 110.000
where usage_date = date '2026-10-01'
  and goods_code = 'M04-0126-1'
  and status = 'confirmed'
  and voided_at is null
  and weight_kg = 380.000;

-- PJBY1: 110 → 380
update public.production_jam_usage_entries
set weight_kg = 380.000
where usage_date = date '2026-10-01'
  and goods_code = 'M04-0127-1'
  and status = 'confirmed'
  and voided_at is null
  and weight_kg = 110.000;

-- ---- verify หลัง update ----
do $$
begin
  if not exists (
    select 1 from public.production_jam_usage_entries
    where usage_date = date '2026-10-01'
      and goods_code = 'M04-0126-1'
      and weight_kg = 110.000
      and status = 'confirmed'
  ) then
    raise exception 'Verification failed: PJST3 ยังไม่เป็น 110 kg';
  end if;

  if not exists (
    select 1 from public.production_jam_usage_entries
    where usage_date = date '2026-10-01'
      and goods_code = 'M04-0127-1'
      and weight_kg = 380.000
      and status = 'confirmed'
  ) then
    raise exception 'Verification failed: PJBY1 ยังไม่เป็น 380 kg';
  end if;

  raise notice 'Swap สำเร็จ: PJST3=110 kg, PJBY1=380 kg';
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

-- ---- ดูผลลัพธ์ ----
select
  id,
  usage_date,
  goods_code,
  goods_name_snapshot,
  lot_no,
  weight_kg,
  status,
  created_at
from public.production_jam_usage_entries
where usage_date = date '2026-10-01'
  and goods_code in ('M04-0088', 'M04-0126-1', 'M04-0127-1')
  and status = 'confirmed'
  and voided_at is null
order by goods_code;
