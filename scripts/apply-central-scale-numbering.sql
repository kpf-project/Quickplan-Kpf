\set ON_ERROR_STOP on
begin;

create schema if not exists central_scale;
revoke all on schema central_scale from public, anon, authenticated;
grant usage on schema central_scale to service_role;

create table if not exists central_scale.product_identifiers (
  product_code text primary key check (
    product_code = upper(trim(product_code)) and length(product_code) between 1 and 100
  ),
  product_digits text not null unique check (
    product_digits ~ '^[0-9]{4}$' and product_digits <> '0000'
  ),
  created_at timestamptz not null default clock_timestamp(),
  unique (product_code, product_digits)
);

create table if not exists central_scale.daily_counters (
  production_date date not null check (production_date between date '2000-01-01' and date '2099-12-31'),
  product_digits text not null references central_scale.product_identifiers(product_digits),
  last_number integer not null check (last_number between 1 and 9999),
  primary key (production_date, product_digits)
);

create table if not exists central_scale.barcode_reservations (
  request_id uuid primary key,
  product_code text not null,
  product_digits text not null,
  production_date date not null check (production_date between date '2000-01-01' and date '2099-12-31'),
  shift integer not null check (shift in (1, 2)),
  run_number integer not null check (run_number between 1 and 9999),
  barcode text not null unique check (barcode ~ '^[0-9]{14}$'),
  lot_no text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  reserved_at timestamptz not null default clock_timestamp(),
  unique (production_date, product_digits, run_number),
  foreign key (product_code, product_digits) references central_scale.product_identifiers(product_code, product_digits),
  check (barcode = to_char(production_date, 'DDMMYY') || product_digits || lpad(run_number::text, 4, '0')),
  check (lot_no = to_char(production_date, 'DDMMYY') || product_digits || '-' || shift::text)
);

alter table central_scale.product_identifiers enable row level security;
alter table central_scale.daily_counters enable row level security;
alter table central_scale.barcode_reservations enable row level security;
revoke all on central_scale.product_identifiers, central_scale.daily_counters,
  central_scale.barcode_reservations from public, anon, authenticated, service_role;
grant select, insert on central_scale.product_identifiers to service_role;
grant select, insert, update on central_scale.daily_counters to service_role;
grant select, insert on central_scale.barcode_reservations to service_role;

-- Called only inside the future atomic receipt transaction; no browser allocation endpoint.
create or replace function central_scale.reserve_barcode(
  p_request_id uuid,
  p_product_code text,
  p_payload jsonb,
  p_timestamp timestamptz default clock_timestamp()
) returns central_scale.barcode_reservations
language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare
  v_existing central_scale.barcode_reservations;
  v_result central_scale.barcode_reservations;
  v_code text := upper(trim(p_product_code));
  v_digits text;
  v_local timestamp;
  v_date date;
  v_shift integer;
  v_run integer;
  v_prefix text;
begin
  if p_request_id is null or v_code is null or length(v_code) not between 1 and 100
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 65536 or p_timestamp is null or not isfinite(p_timestamp) then
    raise exception 'Invalid barcode reservation request' using errcode = '22023';
  end if;

  -- Serialize replays before looking at a counter; retrying after midnight keeps the original number.
  perform pg_advisory_xact_lock(hashtextextended('central_scale/request/' || p_request_id::text, 0));
  select * into v_existing from central_scale.barcode_reservations where request_id = p_request_id;
  if found then
    if v_existing.product_code <> v_code or v_existing.payload <> p_payload then
      raise exception 'Barcode request already used for different data' using errcode = '22023';
    end if;
    return v_existing;
  end if;

  select product_digits into v_digits from central_scale.product_identifiers where product_code = v_code;
  if not found then
    raise exception 'Product has no approved barcode identifier' using errcode = '22023';
  end if;
  v_local := p_timestamp at time zone 'Asia/Bangkok';
  v_date := (v_local - interval '7 hours')::date;
  if v_date not between date '2000-01-01' and date '2099-12-31' then
    raise exception 'Production date outside two-digit year range' using errcode = '22023';
  end if;
  v_shift := case when extract(hour from v_local) * 60 + extract(minute from v_local)
    between 420 and 1140 then 1 else 2 end;

  insert into central_scale.daily_counters as counter (production_date, product_digits, last_number)
  values (v_date, v_digits, 1)
  on conflict (production_date, product_digits) do update
    set last_number = counter.last_number + 1 where counter.last_number < 9999
  returning last_number into v_run;
  if v_run is null then
    raise exception 'Daily barcode capacity exhausted (9999)' using errcode = '22003';
  end if;
  v_prefix := to_char(v_date, 'DDMMYY') || v_digits;
  insert into central_scale.barcode_reservations
    (request_id, product_code, product_digits, production_date, shift, run_number, barcode, lot_no, payload)
  values (p_request_id, v_code, v_digits, v_date, v_shift, v_run,
    v_prefix || lpad(v_run::text, 4, '0'), v_prefix || '-' || v_shift::text, p_payload)
  returning * into v_result;
  return v_result;
end;
$function$;

revoke all on function central_scale.reserve_barcode(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function central_scale.reserve_barcode(uuid, text, jsonb, timestamptz) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
