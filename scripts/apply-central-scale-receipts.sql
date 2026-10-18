\set ON_ERROR_STOP on
begin;

-- Staged private storage only; an authenticated, authorized server boundary is required before activation.
create table if not exists central_scale.closed_receipt_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  department_id uuid not null,
  point_id uuid not null,
  product_code text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table central_scale.closed_receipt_requests enable row level security;
revoke all on central_scale.closed_receipt_requests from public, anon, authenticated, service_role;
grant select, insert on central_scale.closed_receipt_requests to service_role;

create table if not exists central_scale.receipts (
  request_id uuid primary key references central_scale.barcode_reservations(request_id),
  actor_id uuid not null,
  department_id uuid not null,
  point_id uuid not null,
  gross_kg numeric not null check (gross_kg > 0 and gross_kg < 'Infinity'::numeric and gross_kg = trunc(gross_kg, 3)),
  tare_kg numeric not null check (tare_kg >= 0 and tare_kg < 'Infinity'::numeric and tare_kg = trunc(tare_kg, 3)),
  net_kg numeric generated always as (gross_kg - tare_kg) stored check (net_kg > 0),
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id, net_kg)
);

create table if not exists central_scale.receipt_movements (
  receipt_request_id uuid primary key references central_scale.receipts(request_id),
  quantity_kg numeric not null check (quantity_kg > 0 and quantity_kg < 'Infinity'::numeric),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (receipt_request_id, quantity_kg) references central_scale.receipts(request_id, net_kg)
);

alter table central_scale.receipts enable row level security;
alter table central_scale.receipt_movements enable row level security;
revoke all on central_scale.receipts, central_scale.receipt_movements from public, anon, authenticated, service_role;
grant select, insert on central_scale.receipts, central_scale.receipt_movements to service_role;

create or replace function central_scale.receive_weight(
  p_request_id uuid,
  p_product_code text,
  p_actor_id uuid,
  p_department_id uuid,
  p_point_id uuid,
  p_gross_kg numeric,
  p_tare_kg numeric
) returns central_scale.receipts
language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare
  v_payload jsonb;
  v_reservation central_scale.barcode_reservations;
  v_receipt central_scale.receipts;
begin
  if p_request_id is null or p_actor_id is null or p_department_id is null or p_point_id is null
    or p_gross_kg is null or p_tare_kg is null
    or not (p_gross_kg > 0 and p_gross_kg < 'Infinity'::numeric
      and p_tare_kg >= 0 and p_tare_kg < p_gross_kg
      and p_gross_kg = trunc(p_gross_kg, 3) and p_tare_kg = trunc(p_tare_kg, 3)) then
    raise exception 'Invalid receipt context or kilogram weights' using errcode = '22023';
  end if;
  v_payload := jsonb_build_object('operation', 'central-receipt',
    'actor_id', p_actor_id, 'department_id', p_department_id, 'point_id', p_point_id,
    'gross_kg', p_gross_kg, 'tare_kg', p_tare_kg);

  perform pg_advisory_xact_lock(hashtextextended('central_scale/request/' || p_request_id::text, 0));
  if exists (select 1 from central_scale.closed_receipt_requests where request_id = p_request_id) then
    raise exception 'Receipt request permanently closed before receiving' using errcode = '22023';
  end if;
  select * into v_reservation from central_scale.barcode_reservations where request_id = p_request_id;
  if found then
    if v_reservation.product_code <> upper(trim(p_product_code)) or p_product_code is null
      or v_reservation.payload <> v_payload then
      raise exception 'Receipt request already used for different data' using errcode = '22023';
    end if;
    select * into v_receipt from central_scale.receipts where request_id = p_request_id;
    if not found or not exists (select 1 from central_scale.receipt_movements
      where receipt_request_id = p_request_id and quantity_kg = v_receipt.net_kg) then
      raise exception 'Incomplete receipt transaction; manual investigation required' using errcode = '23514';
    end if;
    return v_receipt;
  end if;

  -- Allocation time comes from the database, never a browser-supplied business date.
  v_reservation := central_scale.reserve_barcode(p_request_id, p_product_code, v_payload);
  insert into central_scale.receipts (request_id, actor_id, department_id, point_id, gross_kg, tare_kg)
  values (p_request_id, p_actor_id, p_department_id, p_point_id, p_gross_kg, p_tare_kg)
  returning * into v_receipt;
  insert into central_scale.receipt_movements (receipt_request_id, quantity_kg)
  values (p_request_id, v_receipt.net_kg);
  return v_receipt;
end;
$function$;

revoke all on function central_scale.receive_weight(uuid, text, uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function central_scale.receive_weight(uuid, text, uuid, uuid, uuid, numeric, numeric) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
