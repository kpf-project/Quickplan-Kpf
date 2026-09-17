-- Admin user/role schema
-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Core tables
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'custom' check (source in ('hr', 'custom')),
  external_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists departments_source_external_code_key
  on public.departments (source, external_code)
  where external_code is not null;

create unique index if not exists departments_name_key
  on public.departments (lower(name));

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username citext not null,
  department_id uuid references public.departments on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  constraint profiles_username_length check (char_length(username) >= 8)
);

create unique index if not exists profiles_username_key
  on public.profiles (username);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  constraint roles_role_key_key unique (role_key),
  constraint roles_name_key unique (name)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  perm_key text not null,
  label text not null,
  path text not null,
  group_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permissions_perm_key unique (perm_key),
  constraint permissions_path unique (path)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles on delete cascade,
  permission_id uuid not null references public.permissions on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users on delete cascade,
  role_id uuid not null references public.roles on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  primary key (user_id, role_id)
);

create unique index if not exists user_roles_primary_unique
  on public.user_roles (user_id)
  where is_primary;

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid references auth.users,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Access control helpers (defined after core tables)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.role_key = 'admin'
  );
$$;

create or replace function public.has_permission(perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.perm_key = perm_key
  );
$$;

-- Triggers
create trigger set_departments_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create trigger set_permissions_updated_at
  before update on public.permissions
  for each row execute function public.set_updated_at();

-- RLS
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

create policy departments_admin_all
  on public.departments
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_admin_all
  on public.profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_self_select
  on public.profiles
  for select
  using (id = auth.uid());

create policy roles_admin_all
  on public.roles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy permissions_admin_all
  on public.permissions
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy role_permissions_admin_all
  on public.role_permissions
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy user_roles_admin_all
  on public.user_roles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy audit_logs_admin_all
  on public.audit_logs
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed roles and permissions
insert into public.roles (role_key, name, description, is_system)
values ('admin', 'Admin', 'System administrator', true)
on conflict (role_key) do nothing;

insert into public.permissions (perm_key, label, path, group_key)
values
  ('raw-materials-summary', 'Raw Materials Summary', '/raw-materials/summary', 'public'),
  ('raw-materials-lot', 'Raw Materials Lot', '/raw-materials/lot', 'public'),
  ('admin-consolidated', 'Consolidated Dashboard', '/admin/consolidated', 'admin-operations'),
  ('admin-products', 'Products', '/admin/products', 'admin-inventory'),
  ('admin-requisition', 'Raw Material Requisitions', '/admin/raw-material-requisitions/requisition', 'admin-inventory'),
  ('admin-returns', 'Raw Material Returns', '/admin/raw-material-requisitions/return', 'admin-inventory'),
  ('admin-sku-min-max', 'SKU Min-Max', '/admin/sku-min-max', 'admin-inventory'),
  ('admin-suppliers', 'Suppliers', '/admin/suppliers', 'admin-inventory'),
  ('admin-employees', 'Employees', '/admin/employees', 'admin-operations'),
  ('admin-attendance', 'Attendance', '/admin/attendance', 'admin-operations'),
  ('admin-settings', 'Settings', '/admin/settings', 'admin-security')
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on true
where r.role_key = 'admin'
on conflict do nothing;
