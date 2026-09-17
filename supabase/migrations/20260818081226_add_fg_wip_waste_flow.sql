create table if not exists public.production_fg_wip_waste_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  production_date date not null,
  lot_no text not null,
  product_code text not null,
  product_name_snapshot text not null,
  product_barcode text,
  waste_type text not null check (waste_type in ('filling_scrap', 'rejected_can')),
  reason text not null,
  net_weight_kg numeric(12, 3),
  rejected_can_qty integer,
  notes text,
  operator_user_id uuid references auth.users(id),
  operator_username text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  constraint production_fg_wip_waste_value_check check (
    (waste_type = 'filling_scrap' and net_weight_kg > 0 and rejected_can_qty is null)
    or
    (waste_type = 'rejected_can' and rejected_can_qty > 0 and net_weight_kg is null)
  )
);

create index if not exists production_fg_wip_waste_date_idx
  on public.production_fg_wip_waste_logs (production_date desc, created_at desc)
  where voided_at is null;

create index if not exists production_fg_wip_waste_product_lot_idx
  on public.production_fg_wip_waste_logs (product_code, lot_no, created_at desc)
  where voided_at is null;

alter table public.production_fg_wip_waste_logs enable row level security;
revoke all on public.production_fg_wip_waste_logs from anon, authenticated;
grant select, insert on public.production_fg_wip_waste_logs to service_role;

comment on table public.production_fg_wip_waste_logs is
  'FG-linked production waste captured by weight for filling scrap or by count for rejected cans; does not create FG or WIP stock.';
