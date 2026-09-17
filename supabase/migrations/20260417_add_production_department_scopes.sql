create table if not exists public.production_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create unique index if not exists production_departments_code_unique
  on public.production_departments (lower(code))
  where deleted_at is null;

create unique index if not exists production_departments_name_unique
  on public.production_departments (lower(name))
  where deleted_at is null;

drop trigger if exists production_departments_set_updated_at on public.production_departments;
create trigger production_departments_set_updated_at
  before update on public.production_departments
  for each row execute function public.set_updated_at();

create table if not exists public.production_department_products (
  id bigserial primary key,
  department_id uuid not null references public.production_departments(id) on delete cascade,
  sku_code text not null references public.products_cache(sku_code) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create unique index if not exists production_department_products_unique_idx
  on public.production_department_products (department_id, sku_code);

create index if not exists production_department_products_sku_idx
  on public.production_department_products (sku_code);

create table if not exists public.production_department_users (
  id bigserial primary key,
  department_id uuid not null references public.production_departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint production_department_users_role_check check (role in ('viewer', 'editor'))
);

create unique index if not exists production_department_users_unique_idx
  on public.production_department_users (department_id, user_id);

create index if not exists production_department_users_user_idx
  on public.production_department_users (user_id);

alter table public.production_departments enable row level security;
alter table public.production_department_products enable row level security;
alter table public.production_department_users enable row level security;

drop policy if exists production_departments_read on public.production_departments;
create policy production_departments_read
  on public.production_departments
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_departments_manage on public.production_departments;
create policy production_departments_manage
  on public.production_departments
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_products_read on public.production_department_products;
create policy production_department_products_read
  on public.production_department_products
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_products_manage on public.production_department_products;
create policy production_department_products_manage
  on public.production_department_products
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_users_read on public.production_department_users;
create policy production_department_users_read
  on public.production_department_users
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_users_manage on public.production_department_users;
create policy production_department_users_manage
  on public.production_department_users
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );
