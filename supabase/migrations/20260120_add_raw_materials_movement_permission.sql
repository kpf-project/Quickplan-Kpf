-- Add raw materials movement permission
insert into public.permissions (perm_key, label, path, group_key)
values ('raw-materials-movement', 'Raw Materials Movement', '/raw-materials/movement', 'public')
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key = 'raw-materials-movement'
where r.role_key = 'admin'
on conflict do nothing;
