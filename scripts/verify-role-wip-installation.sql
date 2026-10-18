begin read only;
select json_build_object(
  'role_count',(select count(*) from public.roles),
  'role_assignments',(select count(*) from public.user_roles),
  'permission_count',(select count(*) from public.permissions),
  'role_permission_assignments',(select count(*) from public.role_permissions),
  'cost_task_keys',(select json_agg(perm_key order by perm_key) from public.permissions where perm_key in ('production-cost-view','production-cost-write')),
  'wip_opening_permissions',(select json_agg(perm_key order by perm_key) from public.permissions where perm_key in ('wip-opening-view','wip-opening-manage')),
  'atomic_role_writer',to_regprocedure('public.save_role_permissions_atomic(uuid,uuid,text,text,text,uuid[],uuid[])') is not null,
  'central_wip_writer',to_regprocedure('public.record_central_wip_opening(uuid,uuid,uuid,date,jsonb)') is not null,
  'packing_writer',to_regprocedure('public.record_packing_workspace(uuid,uuid,uuid,text,date,text,text,text,jsonb)') is not null,
  'central_wip_documents',to_regclass('public.production_wip_opening_documents') is not null,
  'packing_documents',to_regclass('public.production_packing_documents') is not null
);
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('save_role_permissions_atomic','record_central_wip_opening','record_packing_workspace');
select 'missing_legacy_assignments',count(*) from (
  select jsonb_array_elements(metadata->'legacy_assignments') as item
  from public.audit_logs where action='permission_migration.install'
    and metadata->>'version'='role-task-v1' order by id desc limit 100000
) baseline where not exists (
  select 1 from public.role_permissions rp where rp.role_id=(baseline.item->>'role_id')::uuid
    and rp.permission_id=(baseline.item->>'permission_id')::uuid
);
select c.relname,c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('production_wip_opening_scopes','production_wip_opening_documents','production_wip_opening_entries');
select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('save_role_permissions_atomic','record_central_wip_opening');
select 'wip_opening_rows',count(*) from public.production_wip_opening_documents;
rollback;
