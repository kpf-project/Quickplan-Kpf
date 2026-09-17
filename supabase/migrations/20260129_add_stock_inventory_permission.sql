insert into public.permissions (perm_key, label, path, group_key, created_at)
values ('stock-inventory', 'Stock Inventory', '/stock-inventory', 'data_admin', now())
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key = 'stock-inventory'
where r.role_key = 'admin'
on conflict do nothing;
