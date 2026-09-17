create extension if not exists "pgcrypto";

create table if not exists public.products_cache (
  sku_code text primary key,
  sku_name text not null,
  iccat_code text not null,
  iccat_name text,
  brand_code text,
  brand_name text,
  is_active boolean not null default true,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint products_cache_iccat_code_check
    check (iccat_code in ('04', '04-1', '04-2'))
);

create index if not exists products_cache_iccat_code_idx
  on public.products_cache (iccat_code);

create table if not exists public.production_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_categories_name_idx
  on public.production_categories (name);

create table if not exists public.production_category_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.production_categories(id) on delete cascade,
  sku_code text not null references public.products_cache(sku_code) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists production_category_products_unique_idx
  on public.production_category_products (category_id, sku_code);

create index if not exists production_category_products_sku_idx
  on public.production_category_products (sku_code);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_cache_set_updated_at on public.products_cache;
create trigger products_cache_set_updated_at
  before update on public.products_cache
  for each row execute procedure public.set_updated_at();

drop trigger if exists production_categories_set_updated_at on public.production_categories;
create trigger production_categories_set_updated_at
  before update on public.production_categories
  for each row execute procedure public.set_updated_at();

insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('production-line-settings-view', 'Production Line Settings (View)', '/production-line/settings', 'production-line', now()),
  ('production-line-settings-manage', 'Production Line Settings (Manage)', '/production-line/settings/manage', 'production-line', now())
on conflict (perm_key) do nothing;

alter table public.products_cache enable row level security;
alter table public.production_categories enable row level security;
alter table public.production_category_products enable row level security;

create policy products_cache_read
  on public.products_cache
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

create policy production_categories_read
  on public.production_categories
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

create policy production_categories_manage
  on public.production_categories
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

create policy production_category_products_read
  on public.production_category_products
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

create policy production_category_products_manage
  on public.production_category_products
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );
