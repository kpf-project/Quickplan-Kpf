-- Move the single user-confirmed 430 kg pineapple jam usage from Oct 15 to Oct 14.
\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('jam-usage|62ef7576-fa2a-4d71-927d-f6d8c6b11533|date-to-2026-10-14', 0));

create temp table before_entry on commit drop as
select *
from public.production_jam_usage_entries
where id = '62ef7576-fa2a-4d71-927d-f6d8c6b11533'
for update;

do $$
begin
  if (select count(*) from before_entry) <> 1
     or not exists (
       select 1
       from before_entry
       where usage_date = date '2026-10-15'
         and goods_code = 'M04-0088'
         and goods_name_snapshot = 'สับปะรดกวน'
         and lot_no = '261007'
         and weight_kg = 430.000
         and status = 'confirmed'
         and voided_at is null
     ) then
    raise exception 'Jam usage precondition failed; no data changed';
  end if;

  if exists (
    select 1
    from public.production_jam_usage_entries
    where id <> '62ef7576-fa2a-4d71-927d-f6d8c6b11533'
      and usage_date = date '2026-10-14'
      and goods_code = 'M04-0088'
      and lot_no = '261007'
      and weight_kg = 430.000
      and status = 'confirmed'
  ) then
    raise exception 'A matching Oct 14 jam usage already exists; no data changed';
  end if;
end $$;

\if :APPLY
\copy (select to_jsonb(j) from before_entry j) to '.backups/jam-m040088-261007-430kg-date-20261015-to-14-before.json'
\endif

insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select created_by,
       'production-jam-usage.date-correction',
       'production_jam_usage_entries',
       id,
       jsonb_build_object(
         'reason', 'ผู้ใช้ยืนยันว่าแยม M04-0088 LOT 261007 น้ำหนัก 430 กก. เป็นยอดวันที่ 2026-10-14',
         'previousDate', '2026-10-15',
         'correctedDate', '2026-10-14',
         'before', to_jsonb(j)
       )
from before_entry j;

update public.production_jam_usage_entries
set usage_date = date '2026-10-14'
where id = '62ef7576-fa2a-4d71-927d-f6d8c6b11533';

do $$
begin
  if not exists (
    select 1
    from public.production_jam_usage_entries
    where id = '62ef7576-fa2a-4d71-927d-f6d8c6b11533'
      and usage_date = date '2026-10-14'
      and goods_code = 'M04-0088'
      and goods_name_snapshot = 'สับปะรดกวน'
      and lot_no = '261007'
      and weight_kg = 430.000
      and status = 'confirmed'
      and voided_at is null
  ) then
    raise exception 'Jam usage date correction verification failed';
  end if;

  if exists (
    select 1
    from public.production_jam_usage_entries j
    join before_entry b using (id)
    where (to_jsonb(j) - 'usage_date') <> (to_jsonb(b) - 'usage_date')
  ) then
    raise exception 'Jam usage fields other than usage_date changed unexpectedly';
  end if;
end $$;

select id, usage_date, goods_code, goods_name_snapshot, lot_no, weight_kg, status, created_at
from public.production_jam_usage_entries
where id = '62ef7576-fa2a-4d71-927d-f6d8c6b11533';

\if :APPLY
commit;
\else
rollback;
\endif
