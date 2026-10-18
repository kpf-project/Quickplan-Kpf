\set ON_ERROR_STOP on
begin;

-- Register only; existing role grants are deliberately not copied from other workflows.
insert into public.permissions (perm_key, label, path, group_key)
values ('central-scale-view', 'ดูหน้าชั่งกลาง', '/production-line/weight-scale-live', 'production-line'),
  ('central-scale-receive', 'ชั่งรับเข้าระบบกลาง', '/production-line/weight-scale-live/receive', 'production-line')
on conflict (perm_key) do nothing;

create or replace function central_scale.receive_authorized_weight(
  p_request_id uuid, p_product_code text, p_actor_id uuid,
  p_department_id uuid, p_point_id uuid, p_gross_kg numeric, p_tare_kg numeric
) returns central_scale.receipts
language plpgsql security invoker
set search_path = pg_catalog, central_scale
as $function$
declare
  v_admin boolean;
  v_code text := upper(trim(p_product_code));
  v_subcategory uuid;
begin
  -- Actor comes from a verified server session, not a body field or user_metadata.
  perform 1 from public.profiles where id = p_actor_id and is_active = true for share;
  if not found then raise exception 'Inactive or unknown actor' using errcode = '42501'; end if;
  perform 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_actor_id and r.role_key = 'admin' for share of ur, r;
  v_admin := found;
  if not v_admin then
    perform 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_actor_id and p.perm_key = 'central-scale-receive'
      for share of ur, rp, p;
    if not found then raise exception 'Missing central receipt permission' using errcode = '42501'; end if;
  end if;
  perform 1 from public.production_departments
    where id = p_department_id and is_active = true and deleted_at is null for share;
  if not found then raise exception 'Inactive or unknown department' using errcode = '42501'; end if;
  if not v_admin then
    perform 1 from public.production_department_users
      where user_id = p_actor_id and department_id = p_department_id and role = 'editor' for share;
    if not found then raise exception 'Department editor access required' using errcode = '42501'; end if;
  end if;
  select subcategory_id into v_subcategory from public.production_department_products
    where department_id = p_department_id and sku_code = v_code for share;
  if not found then raise exception 'Product not assigned to department' using errcode = '42501'; end if;
  if v_subcategory is not null then
    perform 1 from public.production_department_product_subcategories
      where id = v_subcategory and department_id = p_department_id for share;
    if not found then raise exception 'Invalid department subcategory' using errcode = '42501'; end if;
  end if;
  perform 1 from public.products_cache where sku_code = v_code and iccat_code = '03'
    and upper(trim(uom_name)) in ('KG', 'KGS', 'กก.', 'กก', 'กิโลกรัม') for share;
  if not found then raise exception 'WIP kilogram product required; conversion not configured' using errcode = '22023'; end if;
  perform 1 from public.production_department_products dp
    join public.production_department_product_subcategories sc on sc.id = dp.subcategory_id and sc.department_id = dp.department_id
    join public.production_departments d on d.id = dp.department_id
    where dp.sku_code = v_code and d.code = 'KP13' and sc.name = 'เปลือก'
    for share of dp, sc, d;
  if found then raise exception 'Shell product excluded from central receiving' using errcode = '42501'; end if;
  return central_scale.receive_weight(p_request_id, v_code, p_actor_id, p_department_id, p_point_id, p_gross_kg, p_tare_kg);
end;
$function$;

revoke all on function central_scale.receive_authorized_weight(uuid, text, uuid, uuid, uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function central_scale.receive_authorized_weight(uuid, text, uuid, uuid, uuid, numeric, numeric) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
