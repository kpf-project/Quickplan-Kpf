insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  (
    'production-line-attendance-view',
    'Production Line Attendance (View)',
    '/production-line/attendance',
    'production-line',
    now()
  ),
  (
    'production-line-attendance-manage',
    'Production Line Attendance (Manage)',
    '/production-line/attendance/manage',
    'production-line',
    now()
  )
on conflict (perm_key) do update
set
  label = excluded.label,
  path = excluded.path,
  group_key = excluded.group_key;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.perm_key in (
    'production-line-attendance-view',
    'production-line-attendance-manage'
  )
where r.role_key = 'admin'
on conflict do nothing;

