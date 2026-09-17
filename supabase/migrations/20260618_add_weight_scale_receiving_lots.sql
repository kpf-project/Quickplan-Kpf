create table if not exists public.production_weight_scale_products (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.production_departments(id) on delete restrict,
  sku_code text not null references public.products_cache(sku_code) on delete restrict,
  lot_format text,
  pass_weight_kg numeric(12, 3),
  tare_weight_kg numeric(12, 3),
  amount_per_pallet integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_weight_scale_products_department_sku_unique
    unique (department_id, sku_code),
  constraint production_weight_scale_products_pass_weight_check
    check (pass_weight_kg is null or pass_weight_kg >= 0),
  constraint production_weight_scale_products_tare_weight_check
    check (tare_weight_kg is null or tare_weight_kg >= 0),
  constraint production_weight_scale_products_amount_per_pallet_check
    check (amount_per_pallet is null or amount_per_pallet >= 0)
);

create table if not exists public.production_weight_scale_lots (
  id uuid primary key default gen_random_uuid(),
  product_config_id uuid not null references public.production_weight_scale_products(id) on delete cascade,
  lot_code text not null,
  status text not null default 'active',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_weight_scale_lots_status_check
    check (status in ('active', 'closed', 'archived')),
  constraint production_weight_scale_lots_product_lot_unique
    unique (product_config_id, lot_code),
  constraint production_weight_scale_lots_id_product_config_unique
    unique (id, product_config_id)
);

alter table public.production_weight_scale_products
  add column if not exists current_lot_id uuid;

alter table public.production_weight_scale_products
  drop constraint if exists production_weight_scale_products_current_lot_fkey;

alter table public.production_weight_scale_products
  add constraint production_weight_scale_products_current_lot_fkey
  foreign key (current_lot_id, id)
  references public.production_weight_scale_lots(id, product_config_id)
  on delete set null;

create table if not exists public.production_weight_receipts (
  id uuid primary key default gen_random_uuid(),
  product_config_id uuid not null references public.production_weight_scale_products(id) on delete restrict,
  lot_id uuid not null references public.production_weight_scale_lots(id) on delete restrict,
  gross_weight_kg numeric(12, 3) not null,
  tare_weight_kg numeric(12, 3) not null,
  net_weight_kg numeric(12, 3) not null,
  pass_weight_kg numeric(12, 3),
  amount_per_pallet integer,
  barcode text,
  weighed_at timestamptz not null default now(),
  weighed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'recorded',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_weight_receipts_status_check
    check (status in ('recorded', 'voided')),
  constraint production_weight_receipts_gross_weight_check
    check (gross_weight_kg >= 0),
  constraint production_weight_receipts_tare_weight_check
    check (tare_weight_kg >= 0),
  constraint production_weight_receipts_net_weight_check
    check (net_weight_kg >= 0),
  constraint production_weight_receipts_pass_weight_check
    check (pass_weight_kg is null or pass_weight_kg >= 0),
  constraint production_weight_receipts_amount_per_pallet_check
    check (amount_per_pallet is null or amount_per_pallet >= 0)
);

create index if not exists production_weight_scale_products_department_idx
  on public.production_weight_scale_products (department_id, is_active, sku_code);

create index if not exists production_weight_scale_products_current_lot_idx
  on public.production_weight_scale_products (current_lot_id)
  where current_lot_id is not null;

create index if not exists production_weight_scale_lots_product_status_idx
  on public.production_weight_scale_lots (product_config_id, status, opened_at desc);

create index if not exists production_weight_scale_lots_lot_code_idx
  on public.production_weight_scale_lots (lot_code);

create index if not exists production_weight_receipts_lot_weighed_idx
  on public.production_weight_receipts (lot_id, weighed_at desc);

create index if not exists production_weight_receipts_product_weighed_idx
  on public.production_weight_receipts (product_config_id, weighed_at desc);

drop trigger if exists production_weight_scale_products_set_updated_at
  on public.production_weight_scale_products;
create trigger production_weight_scale_products_set_updated_at
  before update on public.production_weight_scale_products
  for each row execute function public.set_updated_at();

drop trigger if exists production_weight_scale_lots_set_updated_at
  on public.production_weight_scale_lots;
create trigger production_weight_scale_lots_set_updated_at
  before update on public.production_weight_scale_lots
  for each row execute function public.set_updated_at();

alter table public.production_weight_scale_products enable row level security;
alter table public.production_weight_scale_lots enable row level security;
alter table public.production_weight_receipts enable row level security;

drop policy if exists production_weight_scale_products_read
  on public.production_weight_scale_products;
create policy production_weight_scale_products_read
  on public.production_weight_scale_products
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_weight_scale_products_write
  on public.production_weight_scale_products;
create policy production_weight_scale_products_write
  on public.production_weight_scale_products
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_weight_scale_lots_read
  on public.production_weight_scale_lots;
create policy production_weight_scale_lots_read
  on public.production_weight_scale_lots
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_weight_scale_lots_write
  on public.production_weight_scale_lots;
create policy production_weight_scale_lots_write
  on public.production_weight_scale_lots
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_weight_receipts_read
  on public.production_weight_receipts;
create policy production_weight_receipts_read
  on public.production_weight_receipts
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_weight_receipts_write
  on public.production_weight_receipts;
create policy production_weight_receipts_write
  on public.production_weight_receipts
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

comment on table public.production_weight_scale_products
  is 'Product-level configuration for the weighing station, including the active current lot pointer.';

comment on table public.production_weight_scale_lots
  is 'Internal receiving lots opened by operators for each weighing-station product. Mirrors the legacy current-lot flow.';

comment on table public.production_weight_receipts
  is 'Append-only weight receipt transactions captured from the weighing station and associated with an internal receiving lot.';
