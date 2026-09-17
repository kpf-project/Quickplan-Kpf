create table if not exists public.production_stock_opening_balances (
  id uuid primary key default gen_random_uuid(),
  balance_date date not null,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  department_code text not null,
  product_code text not null references public.products_cache(sku_code) on delete restrict,
  product_name_snapshot text not null,
  category_code text not null default '03',
  lot_no text not null,
  uom_name text,
  quantity numeric(14,3) not null default 0,
  weight_kg numeric(14,3) not null default 0,
  source text not null default 'erp_opening_balance',
  import_batch_no text,
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_stock_opening_balances_quantity_non_negative
    check (quantity >= 0),
  constraint production_stock_opening_balances_weight_non_negative
    check (weight_kg >= 0),
  constraint production_stock_opening_balances_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint production_stock_opening_balances_scope_unique
    unique (balance_date, department_id, product_code, lot_no)
);

create index if not exists production_stock_opening_balances_department_date_idx
  on public.production_stock_opening_balances (department_id, balance_date desc);

create index if not exists production_stock_opening_balances_scope_idx
  on public.production_stock_opening_balances (department_id, product_code, lot_no);

drop trigger if exists production_stock_opening_balances_set_updated_at
  on public.production_stock_opening_balances;
create trigger production_stock_opening_balances_set_updated_at
  before update on public.production_stock_opening_balances
  for each row execute function public.set_updated_at();

alter table public.production_stock_opening_balances enable row level security;

create table if not exists public.production_stock_movements (
  id uuid primary key default gen_random_uuid(),
  movement_no text not null unique,
  movement_type text not null,
  movement_date date not null,
  movement_at timestamptz not null default timezone('utc', now()),
  department_id uuid not null references public.production_departments(id) on delete restrict,
  department_code text not null,
  product_code text not null references public.products_cache(sku_code) on delete restrict,
  product_name_snapshot text not null,
  category_code text not null default '03',
  lot_no text not null,
  uom_name text,
  quantity_in numeric(14,3) not null default 0,
  quantity_out numeric(14,3) not null default 0,
  weight_in_kg numeric(14,3) not null default 0,
  weight_out_kg numeric(14,3) not null default 0,
  source_document_type text,
  source_document_no text,
  reference_type text,
  reference_no text,
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_stock_movements_type_check
    check (
      movement_type in (
        'opening_balance',
        'receipt_in',
        'issue_out',
        'actual_use',
        'return_in',
        'adjustment_in',
        'adjustment_out'
      )
    ),
  constraint production_stock_movements_quantity_in_non_negative
    check (quantity_in >= 0),
  constraint production_stock_movements_quantity_out_non_negative
    check (quantity_out >= 0),
  constraint production_stock_movements_weight_in_non_negative
    check (weight_in_kg >= 0),
  constraint production_stock_movements_weight_out_non_negative
    check (weight_out_kg >= 0),
  constraint production_stock_movements_non_zero_direction
    check (
      quantity_in > 0
      or quantity_out > 0
      or weight_in_kg > 0
      or weight_out_kg > 0
    ),
  constraint production_stock_movements_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_stock_movements_department_date_idx
  on public.production_stock_movements (department_id, movement_date desc, created_at desc);

create index if not exists production_stock_movements_scope_idx
  on public.production_stock_movements (department_id, product_code, lot_no, movement_date desc);

create index if not exists production_stock_movements_type_idx
  on public.production_stock_movements (movement_type, movement_date desc);

create index if not exists production_stock_movements_source_document_idx
  on public.production_stock_movements (source_document_type, source_document_no);

drop trigger if exists production_stock_movements_set_updated_at
  on public.production_stock_movements;
create trigger production_stock_movements_set_updated_at
  before update on public.production_stock_movements
  for each row execute function public.set_updated_at();

alter table public.production_stock_movements enable row level security;

create or replace view public.production_stock_balances_v as
with opening_rows as (
  select
    department_id,
    department_code,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    sum(quantity) as opening_quantity,
    sum(weight_kg) as opening_weight_kg
  from public.production_stock_opening_balances
  group by department_id, department_code, product_code, product_name_snapshot, category_code, lot_no
),
movement_rows as (
  select
    department_id,
    department_code,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    sum(case when movement_type = 'receipt_in' then quantity_in else 0 end) as receipt_quantity,
    sum(case when movement_type = 'receipt_in' then weight_in_kg else 0 end) as receipt_weight_kg,
    sum(case when movement_type = 'issue_out' then quantity_out else 0 end) as issue_quantity,
    sum(case when movement_type = 'issue_out' then weight_out_kg else 0 end) as issue_weight_kg,
    sum(case when movement_type = 'actual_use' then quantity_out else 0 end) as actual_use_quantity,
    sum(case when movement_type = 'actual_use' then weight_out_kg else 0 end) as actual_use_weight_kg,
    sum(case when movement_type = 'return_in' then quantity_in else 0 end) as return_quantity,
    sum(case when movement_type = 'return_in' then weight_in_kg else 0 end) as return_weight_kg,
    sum(case when movement_type = 'adjustment_in' then quantity_in else 0 end) as adjustment_in_quantity,
    sum(case when movement_type = 'adjustment_in' then weight_in_kg else 0 end) as adjustment_in_weight_kg,
    sum(case when movement_type = 'adjustment_out' then quantity_out else 0 end) as adjustment_out_quantity,
    sum(case when movement_type = 'adjustment_out' then weight_out_kg else 0 end) as adjustment_out_weight_kg
  from public.production_stock_movements
  group by department_id, department_code, product_code, product_name_snapshot, category_code, lot_no
),
scopes as (
  select department_id, department_code, product_code, product_name_snapshot, category_code, lot_no
  from opening_rows
  union
  select department_id, department_code, product_code, product_name_snapshot, category_code, lot_no
  from movement_rows
)
select
  scopes.department_id,
  scopes.department_code,
  scopes.product_code,
  scopes.product_name_snapshot,
  scopes.category_code,
  scopes.lot_no,
  coalesce(opening_rows.opening_quantity, 0) as opening_quantity,
  coalesce(opening_rows.opening_weight_kg, 0) as opening_weight_kg,
  coalesce(movement_rows.receipt_quantity, 0) as receipt_quantity,
  coalesce(movement_rows.receipt_weight_kg, 0) as receipt_weight_kg,
  coalesce(movement_rows.issue_quantity, 0) as issue_quantity,
  coalesce(movement_rows.issue_weight_kg, 0) as issue_weight_kg,
  coalesce(movement_rows.actual_use_quantity, 0) as actual_use_quantity,
  coalesce(movement_rows.actual_use_weight_kg, 0) as actual_use_weight_kg,
  coalesce(movement_rows.return_quantity, 0) as return_quantity,
  coalesce(movement_rows.return_weight_kg, 0) as return_weight_kg,
  coalesce(movement_rows.adjustment_in_quantity, 0) as adjustment_in_quantity,
  coalesce(movement_rows.adjustment_in_weight_kg, 0) as adjustment_in_weight_kg,
  coalesce(movement_rows.adjustment_out_quantity, 0) as adjustment_out_quantity,
  coalesce(movement_rows.adjustment_out_weight_kg, 0) as adjustment_out_weight_kg,
  (
    coalesce(opening_rows.opening_quantity, 0)
    + coalesce(movement_rows.receipt_quantity, 0)
    + coalesce(movement_rows.return_quantity, 0)
    + coalesce(movement_rows.adjustment_in_quantity, 0)
    - coalesce(movement_rows.issue_quantity, 0)
    - coalesce(movement_rows.actual_use_quantity, 0)
    - coalesce(movement_rows.adjustment_out_quantity, 0)
  ) as current_quantity,
  (
    coalesce(opening_rows.opening_weight_kg, 0)
    + coalesce(movement_rows.receipt_weight_kg, 0)
    + coalesce(movement_rows.return_weight_kg, 0)
    + coalesce(movement_rows.adjustment_in_weight_kg, 0)
    - coalesce(movement_rows.issue_weight_kg, 0)
    - coalesce(movement_rows.actual_use_weight_kg, 0)
    - coalesce(movement_rows.adjustment_out_weight_kg, 0)
  ) as current_weight_kg
from scopes
left join opening_rows
  on opening_rows.department_id = scopes.department_id
 and opening_rows.product_code = scopes.product_code
 and opening_rows.lot_no = scopes.lot_no
left join movement_rows
  on movement_rows.department_id = scopes.department_id
 and movement_rows.product_code = scopes.product_code
 and movement_rows.lot_no = scopes.lot_no;
