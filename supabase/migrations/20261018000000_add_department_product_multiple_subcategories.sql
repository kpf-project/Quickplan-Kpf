-- Migration: Add department product subcategory links table to allow 1 product in multiple subcategories per department
create table if not exists public.production_department_product_subcategory_links (
  department_id uuid not null references public.production_departments(id) on delete cascade,
  sku_code text not null,
  subcategory_id uuid not null references public.production_department_product_subcategories(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (department_id, sku_code, subcategory_id)
);

create index if not exists production_department_product_subcategory_links_dept_sub_idx
  on public.production_department_product_subcategory_links (department_id, subcategory_id);

create index if not exists production_department_product_subcategory_links_dept_sku_idx
  on public.production_department_product_subcategory_links (department_id, sku_code);

-- Backfill from existing production_department_products.subcategory_id
insert into public.production_department_product_subcategory_links (department_id, sku_code, subcategory_id, is_primary)
select department_id, sku_code, subcategory_id, true
from public.production_department_products
where subcategory_id is not null
on conflict (department_id, sku_code, subcategory_id) do nothing;

alter table public.production_department_product_subcategory_links enable row level security;

drop policy if exists production_department_product_subcategory_links_read
  on public.production_department_product_subcategory_links;
create policy production_department_product_subcategory_links_read
  on public.production_department_product_subcategory_links
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_department_product_subcategory_links_manage
  on public.production_department_product_subcategory_links;
create policy production_department_product_subcategory_links_manage
  on public.production_department_product_subcategory_links
  for all
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));
