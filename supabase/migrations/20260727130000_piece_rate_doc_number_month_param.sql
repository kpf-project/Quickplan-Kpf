-- Allow the caller (e.g. manual back-dated entries) to specify which month is
-- embedded in the piece-rate document number instead of always using the
-- current server month. The sequence still comes from the same atomic
-- per-machine counter row, so uniqueness guarantees are unchanged.
--
-- The 6-argument version from 20260727100000_unify_piece_rate_doc_numbers.sql
-- is dropped and replaced by a 7-argument version (p_month added, defaults to
-- the current Asia/Bangkok month when NULL).

drop function if exists public.next_piece_rate_doc_number(text, integer, text, uuid, text, jsonb);

create function public.next_piece_rate_doc_number(
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
  if p_month is not null and (p_month < 1 or p_month > 12) then
    raise exception 'month must be between 1 and 12';
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
  v_month_2 := lpad(coalesce(p_month, extract(month from timezone('Asia/Bangkok', now()))::integer)::text, 2, '0');
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

revoke all on function public.next_piece_rate_doc_number(text, integer, integer, text, uuid, text, jsonb) from public;
grant execute on function public.next_piece_rate_doc_number(text, integer, integer, text, uuid, text, jsonb) to authenticated;
grant execute on function public.next_piece_rate_doc_number(text, integer, integer, text, uuid, text, jsonb) to service_role;
