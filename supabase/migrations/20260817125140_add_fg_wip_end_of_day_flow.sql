create table if not exists public.production_fg_wip_documents (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  document_no text not null unique,
  production_date date not null,
  shift_name text,
  lot_no text not null,
  fg_product_code text not null,
  fg_product_name_snapshot text not null,
  fg_barcode_snapshot text,
  fg_unit_snapshot text,
  tins_per_case_snapshot integer not null check (tins_per_case_snapshot > 0),
  fg_case_qty integer not null check (fg_case_qty > 0),
  fg_tin_qty integer not null check (fg_tin_qty > 0),
  wip_product_code text not null,
  wip_product_name_snapshot text not null,
  wip_barcode_snapshot text not null,
  wip_tin_qty integer not null check (wip_tin_qty > 0),
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_username_snapshot text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_fg_wip_documents_lot_no_check check (length(trim(lot_no)) between 3 and 50),
  constraint production_fg_wip_documents_fg_math_check check (fg_tin_qty = fg_case_qty * tins_per_case_snapshot)
);

create table if not exists public.production_wip_can_movements (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.production_fg_wip_documents(id) on delete restrict,
  movement_type text not null check (movement_type in ('receipt', 'issue', 'adjustment_in', 'adjustment_out')),
  movement_date date not null,
  product_code text not null,
  product_name_snapshot text not null,
  barcode text not null,
  lot_no text not null,
  quantity_in integer not null default 0 check (quantity_in >= 0),
  quantity_out integer not null default 0 check (quantity_out >= 0),
  operator_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint production_wip_can_movements_one_direction_check check (
    (quantity_in > 0 and quantity_out = 0) or (quantity_out > 0 and quantity_in = 0)
  )
);

create index if not exists production_fg_wip_documents_date_idx
  on public.production_fg_wip_documents (production_date desc, created_at desc);
create index if not exists production_fg_wip_documents_product_lot_idx
  on public.production_fg_wip_documents (fg_product_code, lot_no);
create index if not exists production_wip_can_movements_stock_idx
  on public.production_wip_can_movements (product_code, lot_no, barcode, movement_date, created_at);
create index if not exists production_wip_can_movements_document_idx
  on public.production_wip_can_movements (document_id);

alter table public.production_fg_wip_documents enable row level security;
alter table public.production_wip_can_movements enable row level security;

drop policy if exists production_fg_wip_documents_read on public.production_fg_wip_documents;
create policy production_fg_wip_documents_read on public.production_fg_wip_documents
  for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_wip_can_movements_read on public.production_wip_can_movements;
create policy production_wip_can_movements_read on public.production_wip_can_movements
  for select to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
  );

create or replace function public.record_fg_wip_end_of_day(
  p_request_id text,
  p_document_no text,
  p_production_date date,
  p_shift_name text,
  p_lot_no text,
  p_fg_product_code text,
  p_fg_product_name text,
  p_fg_barcode text,
  p_fg_unit text,
  p_tins_per_case integer,
  p_fg_case_qty integer,
  p_wip_product_code text,
  p_wip_product_name text,
  p_wip_barcode text,
  p_wip_tin_qty integer,
  p_operator_user_id uuid,
  p_operator_username text,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.production_fg_wip_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.production_fg_wip_documents;
begin
  if nullif(trim(p_request_id), '') is null then raise exception 'request_id is required'; end if;
  if p_fg_case_qty <= 0 then raise exception 'fg_case_qty must be positive'; end if;
  if p_wip_tin_qty <= 0 then raise exception 'wip_tin_qty must be positive'; end if;
  if p_tins_per_case <= 0 then raise exception 'tins_per_case must be positive'; end if;

  select * into v_document
  from public.production_fg_wip_documents
  where request_id = p_request_id;
  if found then return v_document; end if;

  insert into public.production_fg_wip_documents (
    request_id, document_no, production_date, shift_name, lot_no,
    fg_product_code, fg_product_name_snapshot, fg_barcode_snapshot, fg_unit_snapshot,
    tins_per_case_snapshot, fg_case_qty, fg_tin_qty,
    wip_product_code, wip_product_name_snapshot, wip_barcode_snapshot, wip_tin_qty,
    operator_user_id, operator_username_snapshot, notes, metadata
  ) values (
    trim(p_request_id), trim(p_document_no), p_production_date, nullif(trim(p_shift_name), ''), trim(p_lot_no),
    trim(p_fg_product_code), trim(p_fg_product_name), nullif(trim(p_fg_barcode), ''), nullif(trim(p_fg_unit), ''),
    p_tins_per_case, p_fg_case_qty, p_fg_case_qty * p_tins_per_case,
    trim(p_wip_product_code), trim(p_wip_product_name), trim(p_wip_barcode), p_wip_tin_qty,
    p_operator_user_id, nullif(trim(p_operator_username), ''), nullif(trim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_document;

  insert into public.production_wip_can_movements (
    document_id, movement_type, movement_date, product_code, product_name_snapshot,
    barcode, lot_no, quantity_in, operator_user_id
  ) values (
    v_document.id, 'receipt', p_production_date, trim(p_wip_product_code), trim(p_wip_product_name),
    trim(p_wip_barcode), trim(p_lot_no), p_wip_tin_qty, p_operator_user_id
  );

  return v_document;
end;
$$;

revoke all on function public.record_fg_wip_end_of_day(text,text,date,text,text,text,text,text,text,integer,integer,text,text,text,integer,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_fg_wip_end_of_day(text,text,date,text,text,text,text,text,text,integer,integer,text,text,text,integer,uuid,text,text,jsonb) to service_role;
grant select on public.production_fg_wip_documents, public.production_wip_can_movements to authenticated;
grant all on public.production_fg_wip_documents, public.production_wip_can_movements to service_role;
