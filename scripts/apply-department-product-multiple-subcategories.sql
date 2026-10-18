\set ON_ERROR_STOP on
begin;

-- Create table for linking products to multiple subcategories in a department
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
revoke all on public.production_department_product_subcategory_links from public, anon, authenticated;
grant select, insert, update, delete on public.production_department_product_subcategory_links to service_role;

select 'department_product_multiple_subcategories_ready';
\if :APPLY
commit;
\else
rollback;
\endif
