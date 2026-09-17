begin;

-- Permission for material verification page (แผนกย่อย + QA)
insert into public.permissions (perm_key, label, path, group_key, created_at)
values (
  'plan.verify_materials',
  'ตรวจสอบวัตถุดิบก่อนเคลม',
  '/production-line/planning/material-verify',
  'production-line',
  now()
)
on conflict (perm_key) do update
set
  label = excluded.label,
  path = excluded.path,
  group_key = excluded.group_key,
  updated_at = now();

-- Grant to admin by default
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key = 'plan.verify_materials'
where r.role_key = 'admin'
on conflict do nothing;

commit;
