create table if not exists public.production_department_product_subcategories (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.production_departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint production_department_product_subcategories_name_check
    check (length(trim(name)) between 1 and 80 and name = trim(name)),
  constraint production_department_product_subcategories_id_department_unique
    unique (id, department_id)
);

create unique index if not exists production_department_product_subcategories_name_unique
  on public.production_department_product_subcategories (department_id, lower(name));

alter table public.production_department_products
  add column if not exists subcategory_id uuid;

alter table public.production_department_products
  drop constraint if exists production_department_products_subcategory_fkey;

alter table public.production_department_products
  add constraint production_department_products_subcategory_fkey
  foreign key (subcategory_id, department_id)
  references public.production_department_product_subcategories (id, department_id)
  on delete restrict;

create index if not exists production_department_products_subcategory_idx
  on public.production_department_products (department_id, subcategory_id)
  where subcategory_id is not null;

alter table public.production_department_product_subcategories enable row level security;

drop policy if exists production_department_product_subcategories_read
  on public.production_department_product_subcategories;
create policy production_department_product_subcategories_read
  on public.production_department_product_subcategories
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_product_subcategories_manage
  on public.production_department_product_subcategories;
create policy production_department_product_subcategories_manage
  on public.production_department_product_subcategories
  for all
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));
