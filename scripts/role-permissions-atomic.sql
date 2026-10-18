-- Included by build-role-task-install.mjs. User-run only.
create or replace function public.save_role_permissions_atomic(
  p_actor_id uuid, p_role_id uuid, p_role_key text, p_name text,
  p_description text, p_permission_ids uuid[], p_expected_permission_ids uuid[]
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $function$
declare
  v_role public.roles;
  v_before uuid[];
  v_after uuid[];
begin
  if not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_actor_id and r.role_key = 'admin'
  ) then raise exception 'Administrator required' using errcode = '42501'; end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'Role name required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_after from unnest(coalesce(p_permission_ids, '{}'::uuid[])) value;
  if exists (
    select 1 from unnest(v_after) requested
    where not exists (select 1 from public.permissions p where p.id = requested)
  ) then raise exception 'Unknown permission' using errcode = '22023'; end if;
  if p_role_id is null then
    if nullif(btrim(p_role_key), '') is null then
      raise exception 'Role key required' using errcode = '22023';
    end if;
    insert into public.roles(role_key,name,description,created_by,updated_by)
      values(p_role_key,btrim(p_name),nullif(p_description,''),p_actor_id,p_actor_id)
      returning * into v_role;
    v_before := '{}'::uuid[];
  else
    select * into v_role from public.roles where id = p_role_id for update;
    if not found then raise exception 'Role not found' using errcode = 'P0002'; end if;
    if v_role.is_system then raise exception 'System role is read only' using errcode = '42501'; end if;
    select coalesce(array_agg(permission_id order by permission_id), '{}'::uuid[])
      into v_before from public.role_permissions where role_id = p_role_id;
    if p_expected_permission_ids is null then
      raise exception 'Reload role before saving' using errcode = '22023';
    end if;
    if v_before <> (select coalesce(array_agg(distinct value order by value),'{}'::uuid[]) from unnest(p_expected_permission_ids) value) then
      raise exception 'Role changed by another administrator. Reload before saving.' using errcode = 'P0001';
    end if;
    update public.roles set name=btrim(p_name),description=nullif(p_description,''),updated_by=p_actor_id
      where id=p_role_id returning * into v_role;
  end if;
  delete from public.role_permissions where role_id=v_role.id;
  insert into public.role_permissions(role_id,permission_id,created_by)
    select v_role.id, value, p_actor_id from unnest(v_after) value;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
    values(p_actor_id,case when p_role_id is null then 'role.create' else 'role.update' end,
      'roles',v_role.id,
      jsonb_build_object('name',v_role.name,'before',v_before,'after',v_after,'permission_count',cardinality(v_after)));
  return to_jsonb(v_role);
end;
$function$;
revoke all on function public.save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[]) to service_role;
