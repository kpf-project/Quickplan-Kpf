import { readFileSync, writeFileSync } from "node:fs";
import { TASK_PERMISSIONS } from "../src/lib/taskPermissions.js";

const entries = Object.entries(TASK_PERMISSIONS);
for (const [key, value] of entries) {
  if (!value.label || !Array.isArray(value.legacyKeys) || !value.legacyKeys.length) throw new Error("Incomplete task binding: " + key);
}
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const rows = entries.map(([key, value]) => "(" + [
  literal(key), literal(value.label), literal((value.path || "/production-line/costing") + (value.path?.includes("?") ? "&" : "?") + "task=" + key),
  literal(value.group || "production_cost"), "array[" + value.legacyKeys.map(literal).join(",") + "]::text[]",
].join(",") + ")").join(",\n");
const sql = `-- GENERATED: node scripts/build-role-task-install.mjs
-- User-run only. Keep ROLE_TASK_PERMISSIONS_ENABLED unset/false until verified.
-- Preserves legacy assignments. Never assigns departments or changes user roles.
-- One-time installation: refuses partial installs and reruns rather than restoring revoked grants.
begin;
lock table public.roles, public.user_roles, public.permissions, public.role_permissions in share row exclusive mode;
create temporary table task_migration_map(perm_key text primary key,label text,path text,group_key text,legacy_keys text[]) on commit drop;
insert into task_migration_map values
${rows};
do $preflight$
begin
  if exists(select 1 from public.permissions p join task_migration_map m using(perm_key)) then
    raise exception 'Task permissions already exist or installation is partial. No grants changed.';
  end if;
end;
$preflight$;
create temporary table legacy_role_snapshot on commit drop as
  select rp.role_id,rp.permission_id,p.perm_key from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id;
insert into public.permissions(perm_key,label,path,group_key)
  select perm_key,label,path,group_key from task_migration_map;
insert into public.role_permissions(role_id,permission_id)
  select distinct old.role_id,p.id from legacy_role_snapshot old
  join task_migration_map m on old.perm_key=any(m.legacy_keys)
  join public.permissions p on p.perm_key=m.perm_key on conflict do nothing;
do $verify$
begin
  if exists(select 1 from legacy_role_snapshot old where not exists(
    select 1 from public.role_permissions rp where rp.role_id=old.role_id and rp.permission_id=old.permission_id
  )) then raise exception 'Legacy assignment changed. All changes rolled back.'; end if;
  if exists(select 1 from legacy_role_snapshot old join task_migration_map m on old.perm_key=any(m.legacy_keys)
    join public.permissions p on p.perm_key=m.perm_key where not exists(
      select 1 from public.role_permissions rp where rp.role_id=old.role_id and rp.permission_id=p.id
  )) then raise exception 'Capability preservation failed. All changes rolled back.'; end if;
  if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    join task_migration_map m on m.perm_key=p.perm_key where not exists(
      select 1 from legacy_role_snapshot old where old.role_id=rp.role_id and old.perm_key=any(m.legacy_keys)
  )) then raise exception 'Unexpected new role capability. All changes rolled back.'; end if;
end;
$verify$;
insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
  values(null,'permission_migration.install','permissions',null,
    jsonb_build_object('version','role-task-v1','legacy_assignments',(select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from legacy_role_snapshot s),
      'task_bindings',(select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from task_migration_map m)));
${readFileSync(new URL("./role-permissions-atomic.sql", import.meta.url), "utf8")}
select m.perm_key,m.label,count(rp.role_id) as assigned_roles
  from task_migration_map m join public.permissions p on p.perm_key=m.perm_key
  left join public.role_permissions rp on rp.permission_id=p.id group by m.perm_key,m.label order by m.perm_key;
notify pgrst, 'reload schema';
commit;
`;
writeFileSync(new URL("./install-role-task-permissions.sql", import.meta.url), sql);
console.log("Generated one-time role-task install with " + entries.length + " bindings; no database was contacted.");
