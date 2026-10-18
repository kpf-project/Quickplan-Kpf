-- Allocate piece-rate document numbers against the operator-selected work date.
-- Existing RPCs remain unchanged for older clients.

create or replace function public.next_piece_rate_doc_number_for_date(
  p_machine_code text,
  p_year_be integer,
  p_month integer,
  p_doc_date date,
  p_source text,
  p_actor_user_id uuid,
  p_request_id text,
  p_metadata jsonb
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
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));
  v_source := lower(coalesce(trim(p_source), 'daily_scan'));

  if p_doc_date is null or p_doc_date > timezone('Asia/Bangkok', now())::date then
    raise exception 'work date is invalid';
  end if;
  if p_year_be <> extract(year from p_doc_date)::integer + 543
    or p_month <> extract(month from p_doc_date)::integer then
    raise exception 'work date does not match document year/month';
  end if;
  if v_machine_code = '' or char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;
  if v_source not in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq') then
    raise exception 'source is invalid';
  end if;

  insert into public.production_piece_rate_daily_doc_counters (doc_date, last_seq, updated_at)
  values (p_doc_date, 1, now())
  on conflict (doc_date)
  do update set
    last_seq = public.production_piece_rate_daily_doc_counters.last_seq + 1,
    updated_at = now()
  where public.production_piece_rate_daily_doc_counters.last_seq < 999
  returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'piece-rate document sequence is full (999) for date %', p_doc_date;
  end if;

  v_doc_no := to_char(p_doc_date, 'YYYYMMDD') || lpad(v_seq::text, 3, '0');

  insert into public.production_daily_work_doc_counter_audits (
    machine_code, year_be, doc_round, doc_seq, doc_no, source,
    actor_user_id, request_id, metadata, created_at
  )
  values (
    v_machine_code,
    extract(year from p_doc_date)::integer + 543,
    1,
    v_seq,
    v_doc_no,
    v_source,
    p_actor_user_id,
    nullif(trim(coalesce(p_request_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('workDate', to_char(p_doc_date, 'YYYY-MM-DD')),
    now()
  )
  on conflict (doc_no) do nothing;

  return jsonb_build_object(
    'doc_no', v_doc_no,
    'doc_round', 1,
    'doc_seq', v_seq,
    'machine_code', v_machine_code,
    'doc_date', p_doc_date
  );
end;
$$;

create or replace function public.raise_piece_rate_doc_counter_for_date(
  p_machine_code text,
  p_year_be integer,
  p_seq integer,
  p_doc_date date,
  p_doc_no text,
  p_source text,
  p_actor_user_id uuid,
  p_request_id text,
  p_metadata jsonb
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

  if p_doc_date is null or p_doc_date > timezone('Asia/Bangkok', now())::date then
    raise exception 'work date is invalid';
  end if;
  if p_year_be <> extract(year from p_doc_date)::integer + 543 then
    raise exception 'work date does not match document year';
  end if;
  if v_machine_code = '' or char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;
  if p_seq is null or p_seq < 1 or p_seq > 999 then
    raise exception 'seq must be between 1 and 999';
  end if;
  if v_source not in ('daily_scan', 'pallet_scan', 'manual', 'import', 'system', 'legacy_seq') then
    raise exception 'source is invalid';
  end if;
  if p_doc_no is not null and trim(p_doc_no) <> '' then
    if trim(p_doc_no) !~ '^[0-9]{11}$'
      or substr(trim(p_doc_no), 1, 8) <> to_char(p_doc_date, 'YYYYMMDD') then
      raise exception 'document number does not match work date';
    end if;
  end if;

  insert into public.production_piece_rate_daily_doc_counters (doc_date, last_seq, updated_at)
  values (p_doc_date, p_seq, now())
  on conflict (doc_date)
  do update set
    last_seq = greatest(public.production_piece_rate_daily_doc_counters.last_seq, p_seq),
    updated_at = now()
  returning last_seq into v_last_seq;

  if p_doc_no is not null and trim(p_doc_no) <> '' then
    insert into public.production_daily_work_doc_counter_audits (
      machine_code, year_be, doc_round, doc_seq, doc_no, source,
      actor_user_id, request_id, metadata, created_at
    )
    values (
      v_machine_code,
      extract(year from p_doc_date)::integer + 543,
      1,
      p_seq,
      trim(p_doc_no),
      v_source,
      p_actor_user_id,
      nullif(trim(coalesce(p_request_id, '')), ''),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('workDate', to_char(p_doc_date, 'YYYY-MM-DD')),
      now()
    )
    on conflict (doc_no) do nothing;
  end if;

  return jsonb_build_object('doc_date', p_doc_date, 'last_seq', v_last_seq);
end;
$$;

revoke all on function public.next_piece_rate_doc_number_for_date(
  text, integer, integer, date, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.next_piece_rate_doc_number_for_date(
  text, integer, integer, date, text, uuid, text, jsonb
) to service_role;

revoke all on function public.raise_piece_rate_doc_counter_for_date(
  text, integer, integer, date, text, text, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.raise_piece_rate_doc_counter_for_date(
  text, integer, integer, date, text, text, uuid, text, jsonb
) to service_role;
