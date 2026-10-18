-- Phase 1: preserve existing costing access and register real read/write keys.
-- User-run only. Do NOT enable ROLE_TASK_PERMISSIONS_ENABLED until this commits.
-- Old permissions and assignments are retained. Department rules are untouched.
-- One-time install: refuses to regrant permissions after administrators edit them.
begin;
lock table public.permissions, public.role_permissions in share row exclusive mode;

do $install$
begin
  if exists (
    select 1 from public.permissions
    where perm_key in ('production-cost-view', 'production-cost-write')
  ) then
    raise exception 'Costing task permissions already exist. Installation aborted; existing grants were not overwritten.';
  end if;
  if not exists (
    select 1 from public.permissions where perm_key = 'production-line-attendance-view'
  ) then
    raise exception 'Legacy costing permission missing. Installation aborted.';
  end if;
end;
$install$;

insert into public.permissions (perm_key, label, path, group_key)
values
  ('production-cost-view', 'เปิดดูต้นทุนการผลิต', '/production-line/costing?capability=view', 'production_cost'),
  ('production-cost-write', 'บันทึกและแก้ไขต้นทุนการผลิต', '/production-line/costing?capability=write', 'production_cost');

insert into public.role_permissions (role_id, permission_id, created_by)
select rp.role_id, new_permission.id, rp.created_by
from public.role_permissions rp
join public.permissions old_permission on old_permission.id = rp.permission_id
cross join public.permissions new_permission
where old_permission.perm_key = 'production-line-attendance-view'
  and new_permission.perm_key in ('production-cost-view', 'production-cost-write')
on conflict do nothing;

do $verify$
begin
  if exists (
    select 1 from public.role_permissions rp
    join public.permissions old_permission on old_permission.id = rp.permission_id
    cross join public.permissions new_permission
    where old_permission.perm_key = 'production-line-attendance-view'
      and new_permission.perm_key in ('production-cost-view', 'production-cost-write')
      and not exists (
        select 1 from public.role_permissions mapped
        where mapped.role_id = rp.role_id and mapped.permission_id = new_permission.id
      )
  ) then
    raise exception 'Preservation check failed. Entire installation rolled back.';
  end if;
end;
$verify$;

select r.name as role_name, p.perm_key, p.label
from public.role_permissions rp
join public.roles r on r.id = rp.role_id
join public.permissions p on p.id = rp.permission_id
where p.perm_key in ('production-cost-view', 'production-cost-write')
order by r.name, p.perm_key;
commit;
