-- Backfill legacy Plan No values to standard format:
-- Master: MP-YYYY-WWW-XXX
-- Sub:    SP-YYYY-WWW-XXX-DEPT(-BO)

create temp table tmp_plan_no_backfill_map as
with raw_keys as (
  select
    upper(trim(master_plan_no)) as legacy_key,
    coalesce(period_start::date, created_at::date, current_date) as anchor_date
  from public.production_master_plans
  where coalesce(trim(master_plan_no), '') <> ''
    and upper(trim(master_plan_no)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'

  union all

  select
    upper(trim(master_plan_no)) as legacy_key,
    coalesce(created_at::date, current_date) as anchor_date
  from public.production_sub_plans
  where coalesce(trim(master_plan_no), '') <> ''
    and upper(trim(master_plan_no)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'

  union all

  select
    upper(trim(coalesce(nullif(master_plan_no, ''), nullif(plan_group_id, '')))) as legacy_key,
    coalesce(period_start::date, entry_date::date, updated_at::date, current_date) as anchor_date
  from public.production_plan_status
  where coalesce(trim(coalesce(nullif(master_plan_no, ''), nullif(plan_group_id, ''))), '') <> ''
    and upper(trim(coalesce(nullif(master_plan_no, ''), nullif(plan_group_id, ''))))
      !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
),
legacy_key_dates as (
  select
    legacy_key,
    min(
      coalesce(
        case
          when legacy_key ~ '^MP-[0-9]{8}-[0-9]{8}$'
            then to_date(substring(legacy_key from 4 for 8), 'YYYYMMDD')
          when legacy_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}__'
            then to_date(substring(legacy_key from 1 for 10), 'YYYY-MM-DD')
          else anchor_date
        end,
        anchor_date
      )
    )::date as anchor_date
  from raw_keys
  where legacy_key is not null and legacy_key <> ''
  group by legacy_key
),
existing_sequences as (
  select
    year_key,
    week_key,
    max(seq_no)::int as max_seq
  from (
    select
      substring(master_plan_no from 4 for 4)::int as year_key,
      substring(master_plan_no from 10 for 2)::int as week_key,
      substring(master_plan_no from 13 for 3)::int as seq_no
    from public.production_master_plans
    where master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'

    union all

    select
      substring(master_plan_no from 4 for 4)::int as year_key,
      substring(master_plan_no from 10 for 2)::int as week_key,
      substring(master_plan_no from 13 for 3)::int as seq_no
    from public.production_sub_plans
    where master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'

    union all

    select
      substring(master_plan_no from 4 for 4)::int as year_key,
      substring(master_plan_no from 10 for 2)::int as week_key,
      substring(master_plan_no from 13 for 3)::int as seq_no
    from public.production_plan_status
    where master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  ) seq_rows
  group by year_key, week_key
),
ranked as (
  select
    d.legacy_key,
    extract(isoyear from d.anchor_date)::int as year_key,
    extract(week from d.anchor_date)::int as week_key,
    row_number() over (
      partition by extract(isoyear from d.anchor_date)::int, extract(week from d.anchor_date)::int
      order by d.legacy_key
    ) as rn
  from legacy_key_dates d
)
select
  r.legacy_key,
  format(
    'MP-%s-W%s-%s',
    r.year_key::text,
    lpad(r.week_key::text, 2, '0'),
    lpad((coalesce(e.max_seq, 0) + r.rn)::text, 3, '0')
  ) as canonical_master_plan_no
from ranked r
left join existing_sequences e
  on e.year_key = r.year_key
 and e.week_key = r.week_key;

create unique index if not exists tmp_plan_no_backfill_map_legacy_key_idx
  on tmp_plan_no_backfill_map (legacy_key);

create unique index if not exists tmp_plan_no_backfill_map_canonical_idx
  on tmp_plan_no_backfill_map (canonical_master_plan_no);

-- Normalize already-standard master plan numbers to uppercase.
update public.production_master_plans
set master_plan_no = upper(trim(master_plan_no))
where master_plan_no ~* '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and master_plan_no <> upper(trim(master_plan_no));

update public.production_sub_plans
set master_plan_no = upper(trim(master_plan_no))
where master_plan_no ~* '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and master_plan_no <> upper(trim(master_plan_no));

update public.production_plan_status
set master_plan_no = upper(trim(master_plan_no))
where master_plan_no ~* '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and master_plan_no <> upper(trim(master_plan_no));

update public.production_plan_status
set plan_group_id = upper(trim(plan_group_id))
where plan_group_id ~* '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and plan_group_id <> upper(trim(plan_group_id));

-- Backfill non-standard values using generated mapping.
update public.production_master_plans m
set master_plan_no = map.canonical_master_plan_no
from tmp_plan_no_backfill_map map
where upper(trim(m.master_plan_no)) = map.legacy_key
  and upper(trim(m.master_plan_no)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$';

update public.production_sub_plans sp
set master_plan_no = map.canonical_master_plan_no
from tmp_plan_no_backfill_map map
where upper(trim(sp.master_plan_no)) = map.legacy_key
  and upper(trim(sp.master_plan_no)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$';

update public.production_plan_status s
set master_plan_no = map.canonical_master_plan_no
from tmp_plan_no_backfill_map map
where upper(trim(s.master_plan_no)) = map.legacy_key
  and upper(trim(s.master_plan_no)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$';

update public.production_plan_status s
set master_plan_no = map.canonical_master_plan_no
from tmp_plan_no_backfill_map map
where (s.master_plan_no is null or trim(s.master_plan_no) = '')
  and upper(trim(s.plan_group_id)) = map.legacy_key
  and upper(trim(s.plan_group_id)) !~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$';

update public.production_plan_status
set plan_group_id = master_plan_no
where master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and coalesce(trim(plan_group_id), '') <> master_plan_no;

-- Build normalized department code map for Sub Plan No.
create temp table tmp_department_plan_code as
select
  d.id as department_id,
  coalesce(
    nullif(regexp_replace(upper(coalesce(d.code, '')), '[^A-Z0-9_]', '', 'g'), ''),
    'UNASSIGNED'
  ) as department_code
from public.production_departments d;

create unique index if not exists tmp_department_plan_code_idx
  on tmp_department_plan_code (department_id);

-- Backfill sub plan numbers in production_sub_plans.
update public.production_sub_plans sp
set sub_plan_no = format(
  'SP-%s-%s%s',
  substring(sp.master_plan_no from 4),
  left(coalesce(dc.department_code, 'UNASSIGNED'), 32),
  case
    when upper(coalesce(sp.sub_plan_no, '')) like '%-BO' or sp.status = 'backorder' then '-BO'
    else ''
  end
)
from tmp_department_plan_code dc
where sp.master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and dc.department_id = sp.department_id
  and (
    sp.sub_plan_no is null
    or upper(trim(sp.sub_plan_no)) !~ '^SP-[0-9]{4}-W[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$'
  );

-- Backfill sub plan numbers in production_plan_status for sub plan rows.
update public.production_plan_status s
set sub_plan_no = format(
  'SP-%s-%s%s',
  substring(s.master_plan_no from 4),
  left(coalesce(dc.department_code, 'UNASSIGNED'), 32),
  case
    when s.status = 'backorder' or s.plan_id like '%__BO' or upper(coalesce(s.sub_plan_no, '')) like '%-BO'
      then '-BO'
    else ''
  end
)
from tmp_department_plan_code dc
where s.master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and lower(coalesce(s.plan_kind, 'main')) = 'sub'
  and dc.department_id = s.owner_department_id
  and (
    s.sub_plan_no is null
    or upper(trim(s.sub_plan_no)) !~ '^SP-[0-9]{4}-W[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$'
  );

update public.production_plan_status s
set sub_plan_no = format(
  'SP-%s-%s%s',
  substring(s.master_plan_no from 4),
  'UNASSIGNED',
  case
    when s.status = 'backorder' or s.plan_id like '%__BO' or upper(coalesce(s.sub_plan_no, '')) like '%-BO'
      then '-BO'
    else ''
  end
)
where s.master_plan_no ~ '^MP-[0-9]{4}-W[0-9]{2}-[0-9]{3}$'
  and lower(coalesce(s.plan_kind, 'main')) = 'sub'
  and (s.owner_department_id is null or not exists (
    select 1
    from tmp_department_plan_code dc
    where dc.department_id = s.owner_department_id
  ))
  and (
    s.sub_plan_no is null
    or upper(trim(s.sub_plan_no)) !~ '^SP-[0-9]{4}-W[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$'
  );

drop table if exists tmp_department_plan_code;
drop table if exists tmp_plan_no_backfill_map;
