drop index if exists public.production_daily_work_logs_machine_year_round_seq_unique_idx;

create temporary table tmp_daily_work_doc_no_map (
  id uuid primary key,
  old_doc_no text,
  new_doc_no text not null,
  year_be integer not null,
  new_round integer not null,
  new_seq integer not null
) on commit drop;

insert into tmp_daily_work_doc_no_map (
  id,
  old_doc_no,
  new_doc_no,
  year_be,
  new_round,
  new_seq
)
with existing_new as (
  select
    id,
    coalesce(
      doc_year_be,
      (extract(year from timezone('Asia/Bangkok', coalesce(logged_at, created_at, now())))::integer + 543)
    ) as year_be,
    ((coalesce(doc_round, 1) - 1) * 100000 + coalesce(doc_seq, 1)) as running
  from public.production_daily_work_logs
  where doc_no ~ '^[0-9]{2}(0[1-9]|1[0-2])[0-9]{2,}$'
),
base_running as (
  select year_be, max(running) as max_running
  from existing_new
  group by year_be
),
targets as (
  select
    l.id,
    l.doc_no as old_doc_no,
    coalesce(
      l.doc_year_be,
      (extract(year from timezone('Asia/Bangkok', coalesce(l.logged_at, l.created_at, now())))::integer + 543)
    ) as year_be,
    lpad(
      extract(month from timezone('Asia/Bangkok', coalesce(l.logged_at, l.created_at, now())))::integer::text,
      2,
      '0'
    ) as month_2,
    row_number() over (
      partition by coalesce(
        l.doc_year_be,
        (extract(year from timezone('Asia/Bangkok', coalesce(l.logged_at, l.created_at, now())))::integer + 543)
      )
      order by coalesce(l.logged_at, l.created_at, now()), l.id
    ) as row_in_year
  from public.production_daily_work_logs l
  where l.doc_no is null
    or l.doc_no !~ '^[0-9]{2}(0[1-9]|1[0-2])[0-9]{2,}$'
),
computed as (
  select
    t.id,
    t.old_doc_no,
    t.year_be,
    t.month_2,
    (coalesce(b.max_running, 0) + t.row_in_year) as new_running
  from targets t
  left join base_running b on b.year_be = t.year_be
)
select
  c.id,
  c.old_doc_no,
  lpad((c.year_be % 100)::text, 2, '0')
    || c.month_2
    || ((((c.new_running - 1) / 100000)::integer + 1)::text)
    || ((((c.new_running - 1) % 100000)::integer + 1)::text) as new_doc_no,
  c.year_be,
  (((c.new_running - 1) / 100000)::integer + 1) as new_round,
  (((c.new_running - 1) % 100000)::integer + 1) as new_seq
from computed c;

update public.production_daily_work_logs l
set
  doc_year_be = m.year_be,
  doc_round = m.new_round,
  doc_seq = m.new_seq,
  doc_no = m.new_doc_no
from tmp_daily_work_doc_no_map m
where l.id = m.id;

update public.production_daily_work_logs l
set revised_from_doc_no = m.new_doc_no
from tmp_daily_work_doc_no_map m
where l.revised_from_doc_no = m.old_doc_no;

update public.production_daily_work_logs l
set replaced_by_doc_no = m.new_doc_no
from tmp_daily_work_doc_no_map m
where l.replaced_by_doc_no = m.old_doc_no;

do $$
declare
  duplicate_count integer;
  invalid_count integer;
begin
  select count(*) into duplicate_count
  from (
    select doc_no
    from public.production_daily_work_logs
    where doc_no is not null
    group by doc_no
    having count(*) > 1
  ) dup;

  if duplicate_count > 0 then
    raise exception 'daily_work doc_no cleanup failed: duplicate doc_no remains (% rows)', duplicate_count;
  end if;

  select count(*) into invalid_count
  from public.production_daily_work_logs
  where doc_no is not null
    and doc_no !~ '^[0-9]{2}(0[1-9]|1[0-2])[0-9]{2,}$';

  if invalid_count > 0 then
    raise exception 'daily_work doc_no cleanup failed: invalid format remains (% rows)', invalid_count;
  end if;
end $$;

alter table public.production_daily_work_logs
  drop constraint if exists production_daily_work_logs_doc_no_check;

alter table public.production_daily_work_logs
  add constraint production_daily_work_logs_doc_no_check
  check (
    doc_no is null
    or doc_no ~ '^[0-9]{2}(0[1-9]|1[0-2])[0-9]{2,}$'
  );

with yearly_running as (
  select
    doc_year_be as year_be,
    max((coalesce(doc_round, 1) - 1) * 100000 + coalesce(doc_seq, 1)) as max_running
  from public.production_daily_work_logs
  where doc_year_be is not null
    and doc_round is not null
    and doc_seq is not null
  group by doc_year_be
)
insert into public.production_daily_work_doc_counters (
  machine_code,
  year_be,
  last_round,
  last_seq,
  updated_at
)
select
  'DW',
  y.year_be,
  (((y.max_running - 1) / 100000)::integer + 1),
  (((y.max_running - 1) % 100000)::integer + 1),
  now()
from yearly_running y
on conflict (machine_code, year_be)
do update set
  last_round = excluded.last_round,
  last_seq = excluded.last_seq,
  updated_at = now();

create unique index if not exists production_daily_work_logs_machine_year_round_seq_unique_idx
  on public.production_daily_work_logs (machine_code, doc_year_be, coalesce(doc_round, 1), doc_seq)
  where machine_code is not null and doc_year_be is not null and doc_seq is not null;
