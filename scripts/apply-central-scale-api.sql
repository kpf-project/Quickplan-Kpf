\set ON_ERROR_STOP on
begin;

create or replace function public.central_scale_receive(
  p_request_id uuid, p_product_code text, p_actor_id uuid,
  p_department_id uuid, p_point_id uuid, p_gross_kg numeric, p_tare_kg numeric,
  p_cycle_id uuid
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare
  v_receipt central_scale.receipts;
  v_result jsonb;
begin
  v_receipt := central_scale.receive_captured_weight(p_request_id, p_product_code,
    p_actor_id, p_department_id, p_point_id, p_gross_kg, p_tare_kg, p_cycle_id);
  select to_jsonb(v_receipt) || jsonb_build_object('barcode', barcode,
    'lot_no', lot_no, 'product_code', product_code, 'production_date', production_date)
    into v_result from central_scale.barcode_reservations where request_id = p_request_id;
  return v_result;
end;
$function$;
revoke all on function public.central_scale_receive(uuid, text, uuid, uuid, uuid, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function public.central_scale_receive(uuid, text, uuid, uuid, uuid, numeric, numeric, uuid) to service_role;

create or replace function public.central_scale_receipt_get(p_request_id uuid, p_actor_id uuid)
returns jsonb language sql security invoker
set search_path = pg_catalog, central_scale
as $function$
  select to_jsonb(r) || jsonb_build_object('barcode', b.barcode, 'lot_no', b.lot_no,
    'product_code', b.product_code, 'production_date', b.production_date)
  from central_scale.receipts r join central_scale.barcode_reservations b using (request_id)
  where r.request_id = p_request_id and r.actor_id = p_actor_id
    and exists (select 1 from public.profiles where id = p_actor_id and is_active = true);
$function$;
revoke all on function public.central_scale_receipt_get(uuid, uuid) from public, anon, authenticated;
grant execute on function public.central_scale_receipt_get(uuid, uuid) to service_role;

create or replace function central_scale.assert_receipt_reader(p_actor_id uuid, p_department_id uuid)
returns void language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare v_admin boolean;
begin
  if not exists (select 1 from public.profiles where id=p_actor_id and is_active=true) then
    raise exception 'Inactive reader' using errcode='42501';
  end if;
  select exists (select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.user_id=p_actor_id and r.role_key='admin') into v_admin;
  if not v_admin and not exists (select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id
    where ur.user_id=p_actor_id and p.perm_key in ('central-scale-view','central-scale-receive')) then
    raise exception 'Missing central read permission' using errcode='42501';
  end if;
  if not exists (select 1 from public.production_departments where id=p_department_id and is_active=true and deleted_at is null)
    or (not v_admin and not exists (select 1 from public.production_department_users
      where user_id=p_actor_id and department_id=p_department_id and role in ('viewer','editor'))) then
    raise exception 'Department read access required' using errcode='42501';
  end if;
end;
$function$;
revoke all on function central_scale.assert_receipt_reader(uuid,uuid) from public,anon,authenticated;
grant execute on function central_scale.assert_receipt_reader(uuid,uuid) to service_role;

create index if not exists central_receipts_department_point_time on central_scale.receipts(department_id,point_id,created_at desc,request_id desc);
create index if not exists central_reservations_production_date on central_scale.barcode_reservations(production_date,request_id);

create or replace function public.central_scale_receipt_history(
  p_actor_id uuid,p_department_id uuid,p_point_id uuid,p_production_date date,p_page integer default 0,p_page_size integer default 25
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog,central_scale
as $function$
declare v_result jsonb;
begin
  perform central_scale.assert_receipt_reader(p_actor_id,p_department_id);
  if p_point_id is null or p_production_date is null or p_page is null or p_page<0 or p_page>10000
    or p_page_size is null or p_page_size not in (15,25,50,100) then
    raise exception 'Invalid history filters' using errcode='22023';
  end if;
  if exists(select 1 from central_scale.receipts r join central_scale.barcode_reservations b using(request_id)
    left join central_scale.receipt_movements m on m.receipt_request_id=r.request_id
    where r.department_id=p_department_id and r.point_id=p_point_id and b.production_date=p_production_date
      and (m.receipt_request_id is null or m.quantity_kg<>r.net_kg)) then
    raise exception 'Incomplete inbound ledger requires investigation' using errcode='23514';
  end if;
  with filtered as (
    select r.*,b.barcode,b.product_code,b.lot_no,b.production_date,m.quantity_kg
    from central_scale.receipts r join central_scale.barcode_reservations b using(request_id)
    join central_scale.receipt_movements m on m.receipt_request_id=r.request_id
    where r.department_id=p_department_id and r.point_id=p_point_id and b.production_date=p_production_date
  ), page_rows as (
    select * from filtered order by created_at desc,request_id desc limit p_page_size offset p_page*p_page_size
  )
  select jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.request_id desc) from page_rows s),'[]'::jsonb),
    'totalCount',(select count(*) from filtered),'totalNetKg',(select coalesce(sum(quantity_kg),0)::text from filtered),
    'departmentInboundKg',(select coalesce(sum(m.quantity_kg),0)::text from central_scale.receipt_movements m
      join central_scale.receipts r on r.request_id=m.receipt_request_id where r.department_id=p_department_id),
    'page',p_page,'pageSize',p_page_size,'productionDate',p_production_date) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.central_scale_receipt_history(uuid,uuid,uuid,date,integer,integer) from public,anon,authenticated;
grant execute on function public.central_scale_receipt_history(uuid,uuid,uuid,date,integer,integer) to service_role;

-- Serialized with receipt creation. A closed missing request can never arrive late and create stock.
create or replace function public.central_scale_resolve_receipt(
  p_request_id uuid,p_actor_id uuid,p_department_id uuid,p_point_id uuid,p_product_code text
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog,central_scale
as $function$
declare v_receipt central_scale.receipts; v_closed central_scale.closed_receipt_requests;
begin
  perform central_scale.assert_receipt_reader(p_actor_id,p_department_id);
  if p_request_id is null or p_point_id is null or p_product_code is null or trim(p_product_code)='' then
    raise exception 'Invalid pending request' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('central_scale/request/'||p_request_id::text,0));
  select * into v_receipt from central_scale.receipts where request_id=p_request_id;
  if found then
    if v_receipt.actor_id<>p_actor_id or v_receipt.department_id<>p_department_id or v_receipt.point_id<>p_point_id
      or not exists(select 1 from central_scale.barcode_reservations where request_id=p_request_id and product_code=upper(trim(p_product_code))) then
      raise exception 'Pending request owner mismatch' using errcode='42501';
    end if;
    if not exists(select 1 from central_scale.receipt_movements where receipt_request_id=p_request_id and quantity_kg=v_receipt.net_kg) then
      raise exception 'Incomplete movement requires investigation' using errcode='23514';
    end if;
    return jsonb_build_object('status','received','receipt',public.central_scale_receipt_get(p_request_id,p_actor_id));
  end if;
  if exists(select 1 from central_scale.barcode_reservations where request_id=p_request_id) then
    raise exception 'Incomplete receipt requires investigation' using errcode='23514';
  end if;
  select * into v_closed from central_scale.closed_receipt_requests where request_id=p_request_id;
  if found and (v_closed.actor_id<>p_actor_id or v_closed.department_id<>p_department_id
    or v_closed.point_id<>p_point_id or v_closed.product_code<>upper(trim(p_product_code))) then
    raise exception 'Closed request owner mismatch' using errcode='42501';
  end if;
  insert into central_scale.closed_receipt_requests(request_id,actor_id,department_id,point_id,product_code)
    values(p_request_id,p_actor_id,p_department_id,p_point_id,upper(trim(p_product_code))) on conflict(request_id) do nothing;
  return jsonb_build_object('status','not_received','requestId',p_request_id);
end;
$function$;
revoke all on function public.central_scale_resolve_receipt(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.central_scale_resolve_receipt(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.central_scale_readiness(p_actor_id uuid,p_department_id uuid,p_point_id uuid,p_product_code text)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog,central_scale
as $function$
begin
  perform central_scale.assert_receipt_reader(p_actor_id,p_department_id);
  return jsonb_build_object('productRegistered',exists(select 1 from central_scale.product_identifiers where product_code=p_product_code),
    'deviceRegistered',exists(select 1 from central_scale.devices where point_id=p_point_id and is_active=true));
end;
$function$;
revoke all on function public.central_scale_readiness(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.central_scale_readiness(uuid,uuid,uuid,text) to service_role;

create or replace function public.central_scale_receipt_for_print(p_request_id uuid,p_actor_id uuid,p_department_id uuid,p_point_id uuid)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog,central_scale
as $function$
declare v_result jsonb;
begin
  perform central_scale.assert_receipt_reader(p_actor_id,p_department_id);
  select to_jsonb(r)||jsonb_build_object('barcode',b.barcode,'lot_no',b.lot_no,'product_code',b.product_code,'production_date',b.production_date)
    into v_result from central_scale.receipts r join central_scale.barcode_reservations b using(request_id)
    join central_scale.receipt_movements m on m.receipt_request_id=r.request_id and m.quantity_kg=r.net_kg
    where r.request_id=p_request_id and r.department_id=p_department_id and r.point_id=p_point_id;
  return v_result;
end;
$function$;
revoke all on function public.central_scale_receipt_for_print(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.central_scale_receipt_for_print(uuid,uuid,uuid,uuid) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
