-- Piece-rate labels use YYYYMMDDXXX (Gregorian Bangkok date + daily sequence).
-- Existing document numbers remain valid; only newly allocated numbers use the
-- compact daily format.

create table if not exists public.production_piece_rate_daily_doc_counters (
  doc_date date primary key,
  last_seq smallint not null default 0,
  updated_at timestamptz not null default now(),
  constraint production_piece_rate_daily_doc_counters_last_seq_check
    check (last_seq between 0 and 999)
);

alter table public.production_piece_rate_daily_doc_counters enable row level security;

alter table public.production_daily_work_doc_counter_audits
  drop constraint if exists production_daily_work_doc_counter_audits_doc_no_check;
alter table public.production_daily_work_doc_counter_audits
  add constraint production_daily_work_doc_counter_audits_doc_no_check
  check (
    doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{2}[0-9]{7}$'
    or doc_no ~ '^[0-9]{11}$'
  );

create or replace function public.next_piece_rate_doc_number(
  p_machine_code text,
  p_year_be integer,
  p_month integer default null,
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
  v_doc_date date;
  v_seq integer;
  v_doc_no text;
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));
  v_source := lower(coalesce(trim(p_source), 'daily_scan'));
  v_doc_date := timezone('Asia/Bangkok', now())::date;

  if v_machine_code = '' then
    raise exception 'machine code is required';
  end if;
  if char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;
  if v_source not in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq') then
    raise exception 'source is invalid';
  end if;

  insert into public.production_piece_rate_daily_doc_counters (doc_date, last_seq, updated_at)
  values (v_doc_date, 1, now())
  on conflict (doc_date)
  do update set
    last_seq = public.production_piece_rate_daily_doc_counters.last_seq + 1,
    updated_at = now()
  where public.production_piece_rate_daily_doc_counters.last_seq < 999
  returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'piece-rate document sequence is full (999) for date %', v_doc_date;
  end if;

  v_doc_no := to_char(v_doc_date, 'YYYYMMDD') || lpad(v_seq::text, 3, '0');

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
    extract(year from v_doc_date)::integer + 543,
    1,
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
    'doc_no', v_doc_no,
    'doc_round', 1,
    'doc_seq', v_seq,
    'machine_code', v_machine_code,
    'doc_date', v_doc_date
  );
end;
$$;

create or replace function public.raise_piece_rate_doc_counter(
  p_machine_code text,
  p_year_be integer,
  p_seq integer,
  p_doc_no text default null,
  p_source text default 'system',
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
  v_doc_date date;
  v_last_seq integer;
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));
  v_source := lower(coalesce(trim(p_source), 'system'));
  v_doc_date := timezone('Asia/Bangkok', now())::date;

  if p_doc_no ~ '^[0-9]{11}$' then
    v_doc_date := to_date(substr(p_doc_no, 1, 8), 'YYYYMMDD');
    if to_char(v_doc_date, 'YYYYMMDD') <> substr(p_doc_no, 1, 8) then
      raise exception 'invalid piece-rate document date';
    end if;
  end if;

  if v_machine_code = '' then
    raise exception 'machine code is required';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 999 then
    raise exception 'seq must be between 1 and 999';
  end if;
  if v_source not in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq') then
    raise exception 'source is invalid';
  end if;

  insert into public.production_piece_rate_daily_doc_counters (doc_date, last_seq, updated_at)
  values (v_doc_date, p_seq, now())
  on conflict (doc_date)
  do update set
    last_seq = greatest(public.production_piece_rate_daily_doc_counters.last_seq, p_seq),
    updated_at = now()
  returning last_seq into v_last_seq;

  if p_doc_no is not null and trim(p_doc_no) <> '' then
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
      extract(year from v_doc_date)::integer + 543,
      1,
      p_seq,
      trim(p_doc_no),
      v_source,
      p_actor_user_id,
      nullif(trim(coalesce(p_request_id, '')), ''),
      coalesce(p_metadata, '{}'::jsonb),
      now()
    )
    on conflict (doc_no) do nothing;
  end if;

  return jsonb_build_object(
    'doc_date', v_doc_date,
    'last_seq', v_last_seq
  );
end;
$$;

revoke all on table public.production_piece_rate_daily_doc_counters from public, anon, authenticated;
grant select, insert, update on table public.production_piece_rate_daily_doc_counters to service_role;

revoke all on function public.next_piece_rate_doc_number(text, integer, integer, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.next_piece_rate_doc_number(text, integer, integer, text, uuid, text, jsonb) to service_role;

revoke all on function public.raise_piece_rate_doc_counter(text, integer, integer, text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.raise_piece_rate_doc_counter(text, integer, integer, text, text, uuid, text, jsonb) to service_role;
