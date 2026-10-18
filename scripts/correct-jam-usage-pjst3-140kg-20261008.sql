-- Keep only the operator-confirmed 140 kg PJST3 entry for the Oct 8 report.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('jam-usage|2026-10-08|M04-0126-1|correct-to-140', 0));

create temp table target_entries on commit drop as
select *
from public.production_jam_usage_entries
where id in (
  '85b1dea7-d834-4675-a259-3d1364e15daf',
  '4e402807-49a2-4f49-9995-746c841f23e1'
)
for update;

do $$
begin
  if (select count(*) from target_entries) <> 2
     or not exists (
       select 1 from target_entries
       where id = '85b1dea7-d834-4675-a259-3d1364e15daf'
         and usage_date = date '2026-10-08'
         and goods_code = 'M04-0126-1'
         and lot_no = '261007'
         and weight_kg = 140.000
         and status = 'voided'
         and voided_at is not null
     )
     or not exists (
       select 1 from target_entries
       where id = '4e402807-49a2-4f49-9995-746c841f23e1'
         and usage_date = date '2026-10-08'
         and goods_code = 'M04-0126-1'
         and weight_kg = 610.000
         and status = 'confirmed'
         and voided_at is null
     ) then
    raise exception 'PJST3 correction precondition failed; no data changed';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_agg(to_jsonb(j) order by weight_kg) from target_entries j) to '.backups/jam-usage-pjst3-correct-to-140kg-20261008-before.json'
\endif

insert into public.audit_logs (actor_id,action,target_table,target_id,metadata)
select created_by,
       case when weight_kg = 140.000
         then 'production-jam-usage.restore-data-correction'
         else 'production-jam-usage.void-data-correction'
       end,
       'production_jam_usage_entries',
       id,
       jsonb_build_object(
         'reason','ผู้ใช้งานแก้ไขคำยืนยัน: รายงานวันที่ 2026-10-08 ต้องคงเฉพาะยอด PJST3 140 กก. และยกเลิกรายการ 610 กก.',
         'before',to_jsonb(j)
       )
from target_entries j;

update public.production_jam_usage_entries
set status = 'confirmed',
    voided_by = null,
    voided_at = null
where id = '85b1dea7-d834-4675-a259-3d1364e15daf'
  and status = 'voided';

update public.production_jam_usage_entries j
set status = 'voided',
    voided_by = j.created_by,
    voided_at = now()
where j.id = '4e402807-49a2-4f49-9995-746c841f23e1'
  and j.status = 'confirmed';

do $$
begin
  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '85b1dea7-d834-4675-a259-3d1364e15daf'
      and status = 'confirmed'
      and voided_at is null
      and weight_kg = 140.000
  ) then
    raise exception '140 kg jam restoration verification failed';
  end if;

  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '4e402807-49a2-4f49-9995-746c841f23e1'
      and status = 'voided'
      and voided_at is not null
      and weight_kg = 610.000
  ) then
    raise exception '610 kg jam cancellation verification failed';
  end if;

  if round((
    select coalesce(sum(weight_kg),0)
    from public.production_jam_usage_entries
    where usage_date = date '2026-10-08'
      and goods_code = 'M04-0126-1'
      and status = 'confirmed'
  )::numeric,3) <> 140.000 then
    raise exception 'Confirmed Oct 8 PJST3 total is not 140 kg';
  end if;
end;
$$;

select id,usage_date,goods_code,lot_no,weight_kg,status,voided_at
from public.production_jam_usage_entries
where usage_date = date '2026-10-08'
  and goods_code = 'M04-0126-1'
order by weight_kg desc;

\if :APPLY
commit;
\else
rollback;
\endif
