alter table public.products_cache
  add column if not exists uom_name text;

alter table public.products_cache
  drop constraint if exists products_cache_iccat_code_check;

alter table public.products_cache
  add constraint products_cache_iccat_code_check
    check (iccat_code in ('01', '02', '03', '04', '04-1', '04-2', '05', '08', '10'));

create table if not exists public.production_boms (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique references public.products_cache(sku_code) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'locked')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_boms_sku_code_idx
  on public.production_boms (sku_code);

create table if not exists public.production_bom_versions (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.production_boms(id) on delete cascade,
  version_no integer not null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'locked')),
  note text,
  diff jsonb,
  changes jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists production_bom_versions_unique_idx
  on public.production_bom_versions (bom_id, version_no);

create index if not exists production_bom_versions_bom_idx
  on public.production_bom_versions (bom_id, version_no desc);

create table if not exists public.production_bom_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.production_bom_versions(id) on delete cascade,
  material_sku_code text not null references public.products_cache(sku_code) on delete restrict,
  qty numeric not null default 0,
  uom_name text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists production_bom_items_version_idx
  on public.production_bom_items (version_id);

create index if not exists production_bom_items_material_idx
  on public.production_bom_items (material_sku_code);

drop trigger if exists production_boms_set_updated_at on public.production_boms;
create trigger production_boms_set_updated_at
  before update on public.production_boms
  for each row execute procedure public.set_updated_at();

alter table public.production_boms enable row level security;
alter table public.production_bom_versions enable row level security;
alter table public.production_bom_items enable row level security;

create policy products_cache_read_bom
  on public.products_cache
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_categories_read_bom
  on public.production_categories
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_category_products_read_bom
  on public.production_category_products
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_boms_read
  on public.production_boms
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_boms_manage
  on public.production_boms
  for all
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  )
  with check (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_bom_versions_read
  on public.production_bom_versions
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_bom_versions_manage
  on public.production_bom_versions
  for all
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  )
  with check (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_bom_items_read
  on public.production_bom_items
  for select
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  );

create policy production_bom_items_manage
  on public.production_bom_items
  for all
  using (
    public.is_admin()
    or public.has_permission('admin-products')
  )
  with check (
    public.is_admin()
    or public.has_permission('admin-products')
  );
