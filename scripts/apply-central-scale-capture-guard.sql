\set ON_ERROR_STOP on
begin;

do $block$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'central_scale.receipts'::regclass
    and conname = 'central_receipt_point_unique') then
    alter table central_scale.receipts add constraint central_receipt_point_unique unique (request_id, point_id);
  end if;
end;
$block$;

create table if not exists central_scale.capture_claims (
  point_id uuid not null,
  cycle_id uuid not null,
  receipt_request_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  primary key (point_id, cycle_id),
  foreign key (receipt_request_id, point_id) references central_scale.receipts(request_id, point_id)
);
alter table central_scale.capture_claims enable row level security;
revoke all on central_scale.capture_claims from public, anon, authenticated, service_role;
grant select, insert on central_scale.capture_claims to service_role;

-- Point/cycle must come from verified device evidence, never arbitrary browser UUIDs.
create or replace function central_scale.receive_captured_weight(
  p_request_id uuid, p_product_code text, p_actor_id uuid,
  p_department_id uuid, p_point_id uuid, p_gross_kg numeric, p_tare_kg numeric,
  p_cycle_id uuid
) returns central_scale.receipts
language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare
  v_claim central_scale.capture_claims;
  v_receipt central_scale.receipts;
begin
  if p_request_id is null or p_point_id is null or p_cycle_id is null then
    raise exception 'Verified weighing cycle required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('central_scale/request/' || p_request_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('central_scale/cycle/' || p_point_id::text || '/' || p_cycle_id::text, 0));
  perform 1 from central_scale.devices where point_id = p_point_id and is_active = true
    and p_gross_kg <= max_kg and mod(p_gross_kg, resolution_kg) = 0 for share;
  if not found then raise exception 'Device inactive or weight outside equipment limits' using errcode = '22023'; end if;
  select * into v_claim from central_scale.capture_claims where receipt_request_id = p_request_id;
  if found and (v_claim.point_id <> p_point_id or v_claim.cycle_id <> p_cycle_id) then
    raise exception 'Receipt request already bound to another weighing cycle' using errcode = '23505';
  end if;
  if not found and exists (select 1 from central_scale.receipts where request_id = p_request_id) then
    raise exception 'Existing receipt has no capture claim; investigation required' using errcode = '23514';
  end if;
  select * into v_claim from central_scale.capture_claims where point_id = p_point_id and cycle_id = p_cycle_id;
  if found and v_claim.receipt_request_id <> p_request_id then
    raise exception 'Weighing cycle already received; recover the original receipt' using errcode = '23505';
  end if;
  v_receipt := central_scale.receive_authorized_weight(p_request_id, p_product_code,
    p_actor_id, p_department_id, p_point_id, p_gross_kg, p_tare_kg);
  insert into central_scale.capture_claims (point_id, cycle_id, receipt_request_id)
  values (p_point_id, p_cycle_id, p_request_id)
  on conflict (point_id, cycle_id) do nothing;
  return v_receipt;
end;
$function$;

revoke all on function central_scale.receive_captured_weight(uuid, text, uuid, uuid, uuid, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function central_scale.receive_captured_weight(uuid, text, uuid, uuid, uuid, numeric, numeric, uuid) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
