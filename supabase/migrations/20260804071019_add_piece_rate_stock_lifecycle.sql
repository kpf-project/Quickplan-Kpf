create table if not exists public.production_piece_rate_stock_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  piece_rate_log_id uuid not null references public.production_piece_rate_logs(id) on delete restrict,
  piece_rate_doc_no text not null,
  piece_rate_barcode text not null,
  lot_no text,
  product_code text not null,
  product_name_snapshot text not null,
  issue_type text not null default 'KPF',
  issue_weight_kg numeric(14, 3) not null,
  issue_status text not null default 'confirmed',
  issued_at timestamptz not null default timezone('utc', now()),
  issued_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text,
  remark text,
  stock_movement_id uuid references public.production_stock_movements(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_piece_rate_stock_issues_issue_type_check
    check (issue_type in ('KPF', 'PB', 'PRISON')),
  constraint production_piece_rate_stock_issues_status_check
    check (issue_status in ('confirmed', 'cancelled')),
  constraint production_piece_rate_stock_issues_weight_positive
    check (issue_weight_kg > 0),
  constraint production_piece_rate_stock_issues_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists production_piece_rate_stock_issues_active_log_uidx
  on public.production_piece_rate_stock_issues (piece_rate_log_id)
  where issue_status = 'confirmed';

create index if not exists production_piece_rate_stock_issues_doc_no_idx
  on public.production_piece_rate_stock_issues (piece_rate_doc_no);

create index if not exists production_piece_rate_stock_issues_barcode_idx
  on public.production_piece_rate_stock_issues (piece_rate_barcode);

create index if not exists production_piece_rate_stock_issues_lot_product_idx
  on public.production_piece_rate_stock_issues (product_code, lot_no, issued_at desc);

drop trigger if exists production_piece_rate_stock_issues_set_updated_at
  on public.production_piece_rate_stock_issues;
create trigger production_piece_rate_stock_issues_set_updated_at
  before update on public.production_piece_rate_stock_issues
  for each row execute function public.set_updated_at();

alter table public.production_piece_rate_stock_issues enable row level security;

revoke all on public.production_piece_rate_stock_issues from anon, authenticated;
grant select, insert, update on public.production_piece_rate_stock_issues to service_role;

create table if not exists public.production_piece_rate_stock_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  piece_rate_issue_id uuid not null references public.production_piece_rate_stock_issues(id) on delete restrict,
  piece_rate_log_id uuid not null references public.production_piece_rate_logs(id) on delete restrict,
  piece_rate_doc_no text not null,
  piece_rate_barcode text not null,
  lot_no text,
  product_code text not null,
  product_name_snapshot text not null,
  return_weight_kg numeric(14, 3) not null,
  return_status text not null default 'confirmed',
  returned_at timestamptz not null default timezone('utc', now()),
  returned_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text,
  remark text,
  stock_movement_id uuid references public.production_stock_movements(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_piece_rate_stock_returns_status_check
    check (return_status in ('confirmed', 'cancelled')),
  constraint production_piece_rate_stock_returns_weight_positive
    check (return_weight_kg > 0),
  constraint production_piece_rate_stock_returns_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_piece_rate_stock_returns_issue_idx
  on public.production_piece_rate_stock_returns (piece_rate_issue_id, returned_at desc);

create index if not exists production_piece_rate_stock_returns_log_idx
  on public.production_piece_rate_stock_returns (piece_rate_log_id, returned_at desc);

create index if not exists production_piece_rate_stock_returns_doc_no_idx
  on public.production_piece_rate_stock_returns (piece_rate_doc_no);

create index if not exists production_piece_rate_stock_returns_barcode_idx
  on public.production_piece_rate_stock_returns (piece_rate_barcode);

drop trigger if exists production_piece_rate_stock_returns_set_updated_at
  on public.production_piece_rate_stock_returns;
create trigger production_piece_rate_stock_returns_set_updated_at
  before update on public.production_piece_rate_stock_returns
  for each row execute function public.set_updated_at();

alter table public.production_piece_rate_stock_returns enable row level security;

revoke all on public.production_piece_rate_stock_returns from anon, authenticated;
grant select, insert, update on public.production_piece_rate_stock_returns to service_role;

comment on table public.production_piece_rate_stock_issues is
  'Stock issue lifecycle for piece-rate / jam-label weigh-in documents. This table links barcode-based issue actions to production_piece_rate_logs without changing weight-scale issue tables.';

comment on table public.production_piece_rate_stock_returns is
  'Stock return lifecycle for piece-rate / jam-label issue documents. Use this table to track returned weight against a piece-rate stock issue.';
