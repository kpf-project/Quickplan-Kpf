-- Void only the operator-rejected 140 kg PJST3 entry for the Oct 8 report.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('jam-usage|2026-10-08|M04-0126-1|140', 0));

create temp table before_target on commit drop as
select *
from public.production_jam_usage_entries
where id = '85b1dea7-d834-4675-a259-3d1364e15daf'
for update;

create temp table retained_entry on commit drop as
select *
from public.production_jam_usage_entries
where id = '4e402807-49a2-4f49-9995-746c841f23e1'
for update;

do $$
begin
  if (select count(*) from before_target) <> 1
     or not exists (
       select 1 from before_target
       where usage_date = date '2026-10-08'
         and goods_code = 'M04-0126-1'
         and lot_no = '261007'
         and weight_kg = 140.000
         and status = 'confirmed'
         and voided_at is null
     ) then
    raise exception 'Target 140 kg jam entry precondition failed; no data changed';
  end if;

  if (select count(*) from retained_entry) <> 1
     or not exists (
       select 1 from retained_entry
       where usage_date = date '2026-10-08'
         and goods_code = 'M04-0126-1'
         and weight_kg = 610.000
         and status = 'confirmed'
         and voided_at is null
     ) then
    raise exception 'Expected retained 610 kg jam entry is missing; no data changed';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('voidedEntry',(select to_jsonb(j) from before_target j),'retainedEntry',(select to_jsonb(j) from retained_entry j))) to '.backups/jam-usage-140kg-20261008-before.json'
\endif

insert into public.audit_logs (actor_id,action,target_table,target_id,metadata)
select created_by,
       'production-jam-usage.void-data-correction',
       'production_jam_usage_entries',
       id,
       jsonb_build_object(
         'reason','ผู้ใช้งานยืนยันให้รายงานวันที่ 2026-10-08 คงเฉพาะยอด PJST3 610 กก. และยกเลิกรายการ 140 กก.',
         'before',to_jsonb(j)
       )
from before_target j;

update public.production_jam_usage_entries j
set status = 'voided',
    voided_by = j.created_by,
    voided_at = now()
where j.id = '85b1dea7-d834-4675-a259-3d1364e15daf'
  and j.status = 'confirmed';

do $$
begin
  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '85b1dea7-d834-4675-a259-3d1364e15daf'
      and status = 'voided'
      and voided_at is not null
      and weight_kg = 140.000
  ) then
    raise exception '140 kg jam cancellation verification failed';
  end if;

  if not exists (
    select 1 from public.production_jam_usage_entries
    where id = '4e402807-49a2-4f49-9995-746c841f23e1'
      and status = 'confirmed'
      and voided_at is null
      and weight_kg = 610.000
  ) then
    raise exception '610 kg retained entry verification failed';
  end if;

  if round((
    select coalesce(sum(weight_kg),0)
    from public.production_jam_usage_entries
    where usage_date = date '2026-10-08'
      and goods_code = 'M04-0126-1'
      and status = 'confirmed'
  )::numeric,3) <> 610.000 then
    raise exception 'Confirmed Oct 8 PJST3 total is not 610 kg';
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
