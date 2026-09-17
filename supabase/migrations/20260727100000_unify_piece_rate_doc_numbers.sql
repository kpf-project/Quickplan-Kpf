-- Unify piece-rate document numbers:
-- New format: [MACHINE_CODE][YY][MM][SEQ7], example P0169070000005
--   YY = Buddhist year 2 digits (Asia/Bangkok), MM = month 2 digits (Asia/Bangkok),
--   SEQ = 7 digits zero-padded, per-machine counter, no R/round segment (last_round fixed = 1).
-- Online and offline flows now share the same per-machine counter row in
-- public.production_daily_work_doc_counters (machine_code, year_be).
-- The legacy shared "PR" scope is no longer used for piece-rate documents.

-- 1) Raise the per-machine sequence ceiling from 100,000 to 9,999,999.
alter table public.production_daily_work_doc_counters
  drop constraint if exists production_daily_work_doc_counters_last_seq_check;
alter table public.production_daily_work_doc_counters
  add constraint production_daily_work_doc_counters_last_seq_check
  check (last_seq >= 0 and last_seq <= 9999999);

-- The audit table also capped doc_seq at 100,000; relax it so piece-rate
-- sequences up to 9,999,999 can be audited.
alter table public.production_daily_work_doc_counter_audits
  drop constraint if exists production_daily_work_doc_counter_audits_doc_seq_check;
alter table public.production_daily_work_doc_counter_audits
  add constraint production_daily_work_doc_counter_audits_doc_seq_check
  check (doc_seq between 1 and 9999999);

-- 2) Allow the new doc_no pattern in the audit table while keeping both
-- historical patterns (legacy daily + round-based) for existing rows.
alter table public.production_daily_work_doc_counter_audits
  drop constraint if exists production_daily_work_doc_counter_audits_doc_no_check;
alter table public.production_daily_work_doc_counter_audits
  add constraint production_daily_work_doc_counter_audits_doc_no_check
  check (
    doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{2}[0-9]{7}$'
  );

-- 3) Atomic per-machine piece-rate document number allocator.
create or replace function public.next_piece_rate_doc_number(
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
  v_seq integer;
  v_doc_no text;
  v_year_2 text;
  v_month_2 text;
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
    last_seq = public.production_daily_work_doc_counters.last_seq + 1,
    last_round = 1,
    updated_at = now()
  where public.production_daily_work_doc_counters.last_seq < 9999999
  returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'piece-rate document sequence is full (9999999) for machine % year %', v_machine_code, p_year_be;
  end if;

  v_year_2 := lpad((p_year_be % 100)::text, 2, '0');
  v_month_2 := lpad(extract(month from timezone('Asia/Bangkok', now()))::text, 2, '0');
  v_doc_no := v_machine_code || v_year_2 || v_month_2 || lpad(v_seq::text, 7, '0');

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
    'year_be', p_year_be
  );
end;
$$;

-- 4) Atomic counter raise (GREATEST semantics) used for offline sync and
-- Raise-Before-Reserve hints so the server counter never lags a device.
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
  v_last_seq integer;
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));
  v_source := lower(coalesce(trim(p_source), 'system'));

  if v_machine_code = '' then
    raise exception 'machine code is required';
  end if;
  if char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;
  if p_year_be is null or p_year_be < 2500 or p_year_be > 2999 then
    raise exception 'year_be must be between 2500 and 2999';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 9999999 then
    raise exception 'seq must be between 1 and 9999999';
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
    p_seq,
    now()
  )
  on conflict (machine_code, year_be)
  do update set
    last_seq = greatest(public.production_daily_work_doc_counters.last_seq, p_seq),
    last_round = 1,
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
      p_year_be,
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
    'machine_code', v_machine_code,
    'year_be', p_year_be,
    'last_seq', v_last_seq
  );
end;
$$;

revoke all on function public.next_piece_rate_doc_number(text, integer, text, uuid, text, jsonb) from public;
grant execute on function public.next_piece_rate_doc_number(text, integer, text, uuid, text, jsonb) to authenticated;
grant execute on function public.next_piece_rate_doc_number(text, integer, text, uuid, text, jsonb) to service_role;

revoke all on function public.raise_piece_rate_doc_counter(text, integer, integer, text, text, uuid, text, jsonb) from public;
grant execute on function public.raise_piece_rate_doc_counter(text, integer, integer, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.raise_piece_rate_doc_counter(text, integer, integer, text, text, uuid, text, jsonb) to service_role;

-- 5) Guard against duplicate active piece-rate document numbers.
-- WARNING: if historical data still contains duplicate doc_no values with
-- doc_status = 'active', this index will FAIL to build. Deduplicate
-- public.production_piece_rate_logs (doc_no) before deploying this migration.
create unique index if not exists production_piece_rate_logs_doc_no_active_uidx
  on public.production_piece_rate_logs (doc_no)
  where doc_status = 'active' and doc_no is not null;
