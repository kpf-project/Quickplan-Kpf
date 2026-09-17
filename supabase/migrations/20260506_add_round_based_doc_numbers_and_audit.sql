-- Round-based daily work document numbers:
-- Format: [MACHINE][YY][R{ROUND}][SEQ6], example P0169R2000001
-- Keeps per-machine/per-year counters and adds immutable allocation audit rows.

alter table if exists public.production_daily_work_doc_counters
  add column if not exists last_round integer not null default 1;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_doc_counters_last_seq_check'
  ) then
    alter table public.production_daily_work_doc_counters
      drop constraint production_daily_work_doc_counters_last_seq_check;
  end if;
end $$;

alter table public.production_daily_work_doc_counters
  add constraint production_daily_work_doc_counters_last_seq_check
  check (last_seq >= 0 and last_seq <= 100000);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_doc_counters_last_round_check'
  ) then
    alter table public.production_daily_work_doc_counters
      add constraint production_daily_work_doc_counters_last_round_check
      check (last_round >= 1);
  end if;
end $$;

create table if not exists public.production_daily_work_doc_counter_audits (
  id bigserial primary key,
  machine_code text not null,
  year_be integer not null,
  doc_round integer not null,
  doc_seq integer not null,
  doc_no text not null,
  source text not null default 'daily_scan'
    check (source in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq')),
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_daily_work_doc_counter_audits_machine_code_check
    check (machine_code ~ '^[A-Z0-9]{2,8}$'),
  constraint production_daily_work_doc_counter_audits_year_be_check
    check (year_be between 2500 and 2999),
  constraint production_daily_work_doc_counter_audits_doc_round_check
    check (doc_round >= 1),
  constraint production_daily_work_doc_counter_audits_doc_seq_check
    check (doc_seq between 1 and 100000),
  constraint production_daily_work_doc_counter_audits_doc_no_check
    check (
      doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
      or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
    )
);

create unique index if not exists production_daily_work_doc_counter_audits_doc_no_uidx
  on public.production_daily_work_doc_counter_audits (doc_no);

create index if not exists production_daily_work_doc_counter_audits_machine_year_created_idx
  on public.production_daily_work_doc_counter_audits (machine_code, year_be, created_at desc);

create index if not exists production_daily_work_doc_counter_audits_source_created_idx
  on public.production_daily_work_doc_counter_audits (source, created_at desc);

create or replace function public.next_production_daily_work_doc_number(
  p_machine_code text,
  p_year_be integer,
  p_source text default 'daily_scan',
  p_actor_user_id uuid default null,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine_code text;
  v_source text;
  v_round integer;
  v_seq integer;
  v_doc_no text;
  v_year_2 text;
  v_wrapped boolean;
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));
  v_source := lower(coalesce(trim(p_source), 'daily_scan'));

  if v_machine_code = '' then
    raise exception 'machine code is required';
  end if;
  if char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;
  if p_year_be is null or p_year_be < 2500 or p_year_be > 2999 then
    raise exception 'year_be must be between 2500 and 2999';
  end if;
  if v_source not in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq') then
    raise exception 'source is invalid';
  end if;

  insert into public.production_daily_work_doc_counters (
    machine_code,
    year_be,
    last_round,
    last_seq,
    updated_at
  )
  values (
    v_machine_code,
    p_year_be,
    1,
    1,
    now()
  )
  on conflict (machine_code, year_be)
  do update set
    last_seq = case
      when public.production_daily_work_doc_counters.last_seq >= 100000 then 1
      else public.production_daily_work_doc_counters.last_seq + 1
    end,
    last_round = case
      when public.production_daily_work_doc_counters.last_seq >= 100000
        then public.production_daily_work_doc_counters.last_round + 1
      else public.production_daily_work_doc_counters.last_round
    end,
    updated_at = now()
  returning last_round, last_seq into v_round, v_seq;

  v_year_2 := lpad((p_year_be % 100)::text, 2, '0');
  v_doc_no := v_machine_code || v_year_2 || 'R' || v_round::text || lpad(v_seq::text, 6, '0');
  v_wrapped := (v_seq = 1 and v_round > 1);

  insert into public.production_daily_work_doc_counter_audits (
    machine_code,
    year_be,
    doc_round,
    doc_seq,
    doc_no,
    source,
    actor_user_id,
    request_id,
    metadata,
    created_at
  )
  values (
    v_machine_code,
    p_year_be,
    v_round,
    v_seq,
    v_doc_no,
    v_source,
    p_actor_user_id,
    nullif(trim(coalesce(p_request_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (doc_no) do nothing;

  return jsonb_build_object(
    'machine_code', v_machine_code,
    'doc_year_be', p_year_be,
    'doc_round', v_round,
    'doc_seq', v_seq,
    'doc_no', v_doc_no,
    'wrapped', v_wrapped
  );
end;
$$;

create or replace function public.next_production_daily_work_doc_seq(
  p_machine_code text,
  p_year_be integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_seq integer;
begin
  v_payload := public.next_production_daily_work_doc_number(
    p_machine_code => p_machine_code,
    p_year_be => p_year_be,
    p_source => 'legacy_seq'
  );

  v_seq := (v_payload ->> 'doc_seq')::integer;
  if v_seq is null or v_seq < 1 then
    raise exception 'invalid sequence';
  end if;
  return v_seq;
end;
$$;

revoke all on function public.next_production_daily_work_doc_number(text, integer, text, uuid, text, jsonb) from public;
grant execute on function public.next_production_daily_work_doc_number(text, integer, text, uuid, text, jsonb) to authenticated;
grant execute on function public.next_production_daily_work_doc_number(text, integer, text, uuid, text, jsonb) to service_role;

revoke all on function public.next_production_daily_work_doc_seq(text, integer) from public;
grant execute on function public.next_production_daily_work_doc_seq(text, integer) to authenticated;
grant execute on function public.next_production_daily_work_doc_seq(text, integer) to service_role;

alter table if exists public.production_daily_work_logs
  add column if not exists doc_round integer;

alter table if exists public.pallet_qty_scan_logs
  add column if not exists doc_year_be integer,
  add column if not exists doc_round integer,
  add column if not exists doc_seq integer;

update public.production_daily_work_logs
set
  doc_year_be = coalesce(
    doc_year_be,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then 2500 + substring(doc_no from '([0-9]{2})R[1-9][0-9]*[0-9]{6}$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then 2500 + substring(doc_no from '([0-9]{2})[0-9]{5}$')::integer
      else null
    end
  ),
  doc_round = coalesce(
    doc_round,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then substring(doc_no from 'R([1-9][0-9]*)[0-9]{6}$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then 1
      else null
    end
  ),
  doc_seq = coalesce(
    doc_seq,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then substring(doc_no from '([0-9]{6})$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then substring(doc_no from '([0-9]{5})$')::integer
      else null
    end
  )
where doc_no is not null
  and (doc_year_be is null or doc_round is null or doc_seq is null);

update public.pallet_qty_scan_logs
set
  doc_year_be = coalesce(
    doc_year_be,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then 2500 + substring(doc_no from '([0-9]{2})R[1-9][0-9]*[0-9]{6}$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then 2500 + substring(doc_no from '([0-9]{2})[0-9]{5}$')::integer
      else null
    end
  ),
  doc_round = coalesce(
    doc_round,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then substring(doc_no from 'R([1-9][0-9]*)[0-9]{6}$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then 1
      else null
    end
  ),
  doc_seq = coalesce(
    doc_seq,
    case
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
        then substring(doc_no from '([0-9]{6})$')::integer
      when doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
        then substring(doc_no from '([0-9]{5})$')::integer
      else null
    end
  )
where doc_no is not null
  and (doc_year_be is null or doc_round is null or doc_seq is null);

alter table public.production_daily_work_logs
  drop constraint if exists production_daily_work_logs_doc_seq_check;
alter table public.production_daily_work_logs
  add constraint production_daily_work_logs_doc_seq_check
  check (doc_seq is null or (doc_seq >= 1 and doc_seq <= 100000));

alter table public.production_daily_work_logs
  drop constraint if exists production_daily_work_logs_doc_no_check;
alter table public.production_daily_work_logs
  add constraint production_daily_work_logs_doc_no_check
  check (
    doc_no is null
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_doc_round_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_doc_round_check
      check (doc_round is null or doc_round >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pallet_qty_scan_logs_doc_year_be_check'
  ) then
    alter table public.pallet_qty_scan_logs
      add constraint pallet_qty_scan_logs_doc_year_be_check
      check (doc_year_be is null or doc_year_be between 2500 and 2999);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pallet_qty_scan_logs_doc_round_check'
  ) then
    alter table public.pallet_qty_scan_logs
      add constraint pallet_qty_scan_logs_doc_round_check
      check (doc_round is null or doc_round >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pallet_qty_scan_logs_doc_seq_check'
  ) then
    alter table public.pallet_qty_scan_logs
      add constraint pallet_qty_scan_logs_doc_seq_check
      check (doc_seq is null or (doc_seq >= 1 and doc_seq <= 100000));
  end if;
end $$;

drop index if exists public.production_daily_work_logs_machine_year_seq_unique_idx;
create unique index if not exists production_daily_work_logs_machine_year_round_seq_unique_idx
  on public.production_daily_work_logs (machine_code, doc_year_be, coalesce(doc_round, 1), doc_seq)
  where machine_code is not null and doc_year_be is not null and doc_seq is not null;

create index if not exists pallet_qty_scan_logs_machine_doc_idx
  on public.pallet_qty_scan_logs (machine_code, doc_year_be, doc_round, doc_seq);

insert into public.production_daily_work_doc_counter_audits (
  machine_code,
  year_be,
  doc_round,
  doc_seq,
  doc_no,
  source,
  actor_user_id,
  request_id,
  metadata,
  created_at
)
select
  machine_code,
  doc_year_be,
  coalesce(doc_round, 1),
  doc_seq,
  doc_no,
  coalesce(source, 'daily_scan'),
  operator_user_id,
  request_id,
  jsonb_build_object(
    'backfilled', true,
    'table', 'production_daily_work_logs'
  ),
  coalesce(logged_at, created_at, now())
from public.production_daily_work_logs
where doc_no is not null
  and machine_code is not null
  and doc_year_be is not null
  and doc_seq is not null
on conflict (doc_no) do nothing;

insert into public.production_daily_work_doc_counter_audits (
  machine_code,
  year_be,
  doc_round,
  doc_seq,
  doc_no,
  source,
  actor_user_id,
  request_id,
  metadata,
  created_at
)
select
  machine_code,
  doc_year_be,
  coalesce(doc_round, 1),
  doc_seq,
  doc_no,
  'pallet_scan',
  recorded_by,
  null,
  jsonb_build_object(
    'backfilled', true,
    'table', 'pallet_qty_scan_logs'
  ),
  coalesce(scanned_at, now())
from public.pallet_qty_scan_logs
where doc_no is not null
  and machine_code is not null
  and doc_year_be is not null
  and doc_seq is not null
on conflict (doc_no) do nothing;
