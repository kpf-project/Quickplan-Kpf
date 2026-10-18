-- Void only the operator-confirmed 760 kg jam usage for the Oct 10 report.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('jam-usage|2026-10-10|M04-0088|760', 0));

do $$
begin
  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = 'fb11e0d1-7b19-4234-9f70-40ee57517525'
      and usage_date = date '2026-10-10'
      and goods_code = 'M04-0088'
      and lot_no = '260928    261003'
      and weight_kg = 760.000
      and status = 'confirmed'
      and voided_at is null
  ) then
    raise exception 'Target 760 kg jam usage precondition failed; no data changed';
  end if;

  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = '5e9599c9-6fe4-441e-897e-2e762c4df3e2'
      and usage_date = date '2026-10-10'
      and goods_code = 'M04-0088'
      and lot_no = '261003'
      and weight_kg = 680.000
      and status = 'confirmed'
      and voided_at is null
  ) then
    raise exception 'Expected retained 680 kg jam usage is missing; no data changed';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(j) from public.production_jam_usage_entries j where j.id = 'fb11e0d1-7b19-4234-9f70-40ee57517525') to '.backups/jam-usage-760kg-20261010-before.json'
\endif

insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select
  created_by,
  'production-jam-usage.void-data-correction',
  'production_jam_usage_entries',
  id,
  jsonb_build_object(
    'reason', 'ผู้ใช้ยืนยันให้ยกเลิกรายการสับปะรดกวน 760 กก. ของวันที่ 2026-10-10 และคงรายการ 680 กก.',
    'before', to_jsonb(j)
  )
from public.production_jam_usage_entries j
where id = 'fb11e0d1-7b19-4234-9f70-40ee57517525';

update public.production_jam_usage_entries
set status = 'voided',
    voided_by = created_by,
    voided_at = now()
where id = 'fb11e0d1-7b19-4234-9f70-40ee57517525'
  and status = 'confirmed';

do $$
begin
  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = 'fb11e0d1-7b19-4234-9f70-40ee57517525'
      and status = 'voided'
      and voided_at is not null
  ) then
    raise exception '760 kg jam usage cancellation verification failed';
  end if;

  if round((
    select coalesce(sum(weight_kg), 0)
    from public.production_jam_usage_entries
    where usage_date = date '2026-10-10'
      and goods_code = 'M04-0088'
      and status = 'confirmed'
  )::numeric, 3) <> 680.000 then
    raise exception 'Confirmed Oct 10 pineapple jam total is not 680 kg';
  end if;
end;
$$;

select id, usage_date, goods_code, lot_no, weight_kg, status, voided_at
from public.production_jam_usage_entries
where usage_date = date '2026-10-10'
  and goods_code = 'M04-0088'
order by weight_kg desc;

\if :APPLY
commit;
\else
rollback;
\endif
