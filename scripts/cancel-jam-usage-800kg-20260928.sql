-- Void only the duplicate 800 kg jam usage confirmed by the operator.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('jam-usage|2026-09-28|M04-0088|260924', 0));

do $$
begin
  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = '1bbcd7de-5d05-44c4-b19d-b1f0f94dc3bb'
      and usage_date = date '2026-09-28'
      and goods_code = 'M04-0088'
      and goods_name_snapshot = 'สับปะรดกวน'
      and lot_no = '260924'
      and weight_kg = 800.000
      and status = 'confirmed'
      and voided_at is null
  ) then
    raise exception 'Target 800 kg jam usage precondition failed; no data changed';
  end if;

  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = '33289c40-c8db-4cf8-b08a-344915bbd0ef'
      and usage_date = date '2026-09-28'
      and goods_code = 'M04-0088'
      and lot_no = '260924'
      and weight_kg = 770.000
      and status = 'confirmed'
      and voided_at is null
  ) then
    raise exception 'Expected 770 kg retained entry is missing; no data changed';
  end if;
end $$;

\if :APPLY
\copy (select to_jsonb(j) from public.production_jam_usage_entries j where j.id = '1bbcd7de-5d05-44c4-b19d-b1f0f94dc3bb') to '.backups/jam-usage-800kg-20260928-before.json'
\endif

insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select
  created_by,
  'production-jam-usage.void-data-correction',
  'production_jam_usage_entries',
  id,
  jsonb_build_object(
    'reason', 'ผู้ใช้ยืนยันว่ารายการ 800 กก. วันที่ 2026-09-28 เป็นการบันทึกซ้ำ',
    'before', to_jsonb(j)
  )
from public.production_jam_usage_entries j
where id = '1bbcd7de-5d05-44c4-b19d-b1f0f94dc3bb';

update public.production_jam_usage_entries
set status = 'voided',
    voided_by = created_by,
    voided_at = now()
where id = '1bbcd7de-5d05-44c4-b19d-b1f0f94dc3bb'
  and status = 'confirmed';

do $$
begin
  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '1bbcd7de-5d05-44c4-b19d-b1f0f94dc3bb'
      and status = 'voided'
      and voided_at is not null
  ) then
    raise exception '800 kg jam usage cancellation verification failed';
  end if;

  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '33289c40-c8db-4cf8-b08a-344915bbd0ef'
      and status = 'confirmed'
      and weight_kg = 770.000
  ) then
    raise exception '770 kg retained entry verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select id, usage_date, goods_code, lot_no, weight_kg, status, voided_at
from public.production_jam_usage_entries
where usage_date = date '2026-09-28'
  and goods_code = 'M04-0088'
  and lot_no = '260924'
order by weight_kg desc;
