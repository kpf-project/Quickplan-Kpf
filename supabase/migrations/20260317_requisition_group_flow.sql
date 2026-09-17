create extension if not exists pgcrypto;

alter table public.production_material_claims_daily
  add column if not exists owner_department_id uuid references public.production_departments(id) on delete set null;

alter table public.production_material_claims_weekly
  add column if not exists owner_department_id uuid references public.production_departments(id) on delete set null;

alter table public.production_material_claim_events
  add column if not exists owner_department_id uuid references public.production_departments(id) on delete set null;

update public.production_material_claims_daily
set owner_department_id = coalesce(owner_department_id, department_id)
where owner_department_id is null;

update public.production_material_claims_weekly
set owner_department_id = coalesce(owner_department_id, department_id)
where owner_department_id is null;

update public.production_material_claim_events
set owner_department_id = coalesce(owner_department_id, to_department_id, from_department_id)
where owner_department_id is null;

alter table public.production_material_claims_daily
  drop constraint if exists production_material_claims_daily_unique;

alter table public.production_material_claims_daily
  add constraint production_material_claims_daily_unique
  unique (master_plan_no, material_sku_code, material_goods_code, work_date, owner_department_id);

alter table public.production_material_claims_weekly
  drop constraint if exists production_material_claims_weekly_unique;

alter table public.production_material_claims_weekly
  add constraint production_material_claims_weekly_unique
  unique (master_plan_no, material_sku_code, material_goods_code, week_start_date, owner_department_id);

create index if not exists production_material_claims_daily_owner_idx
  on public.production_material_claims_daily (owner_department_id, department_id, status, work_date);

create index if not exists production_material_claims_weekly_owner_idx
  on public.production_material_claims_weekly (owner_department_id, department_id, status, week_start_date);

create index if not exists production_material_claim_events_owner_idx
  on public.production_material_claim_events (owner_department_id, bucket_date, created_at desc);

create table if not exists public.production_requisition_group_batches (
  id uuid primary key default gen_random_uuid(),
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  claim_grain text not null default 'weekly',
  status text not null default 'draft',
  can_consolidate_cross_qa boolean not null default false,
  created_by uuid null references public.profiles(id) on delete set null,
  confirmed_by uuid null references public.profiles(id) on delete set null,
  exported_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz null,
  exported_at timestamptz null,
  document_no text null,
  export_batch_id uuid null,
  group_name text null,
  destination_note text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint production_requisition_group_batches_status_check
    check (status in ('draft', 'ready_to_export', 'exported', 'cancelled'))
);

create index if not exists production_requisition_group_batches_plan_idx
  on public.production_requisition_group_batches (master_plan_no, status, created_at desc);

create index if not exists production_requisition_group_batches_export_idx
  on public.production_requisition_group_batches (status, exported_at desc);

create table if not exists public.production_requisition_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.production_requisition_group_batches(id) on delete cascade,
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  claim_grain text not null,
  bucket_date date not null,
  material_sku_code text not null references public.products_cache(sku_code),
  material_goods_code text not null,
  owner_department_id uuid null references public.production_departments(id) on delete set null,
  claim_department_id uuid null references public.production_departments(id) on delete set null,
  issue_qty numeric(18,3) not null default 0,
  required_qty numeric(18,3) not null default 0,
  source_plan_ids jsonb not null default '[]'::jsonb,
  source_owner_department_ids jsonb not null default '[]'::jsonb,
  source_row_key text not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint production_requisition_group_items_issue_qty_check check (issue_qty >= 0),
  constraint production_requisition_group_items_required_qty_check check (required_qty >= 0),
  constraint production_requisition_group_items_source_row_unique unique (source_row_key)
);

create index if not exists production_requisition_group_items_group_idx
  on public.production_requisition_group_items (group_id, material_goods_code);

create index if not exists production_requisition_group_items_owner_idx
  on public.production_requisition_group_items (owner_department_id, claim_department_id, bucket_date);

create table if not exists public.production_requisition_export_batches (
  id uuid primary key default gen_random_uuid(),
  master_plan_no text not null references public.production_master_plans(master_plan_no) on delete cascade,
  file_name text not null,
  exported_by uuid null references public.profiles(id) on delete set null,
  exported_at timestamptz not null default timezone('utc', now()),
  group_count integer not null default 0,
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists production_requisition_export_batches_plan_idx
  on public.production_requisition_export_batches (master_plan_no, exported_at desc);

alter table public.production_requisition_group_batches
  add constraint production_requisition_group_batches_export_batch_fkey
  foreign key (export_batch_id)
  references public.production_requisition_export_batches(id)
  on delete set null;

create table if not exists public.production_requisition_document_sequences (
  sequence_key text primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.allocate_requisition_document_numbers(
  requested_at timestamptz default timezone('utc', now()),
  requested_count integer default 1
)
returns table (
  sequence_key text,
  sequence_value integer,
  document_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_requested_at timestamptz := coalesce(requested_at, timezone('utc', now()));
  safe_requested_count integer := greatest(coalesce(requested_count, 0), 0);
  be_year integer;
  yy text;
  mm text;
  seq_key text;
  final_last_value integer;
  start_value integer;
begin
  if safe_requested_count <= 0 then
    return;
  end if;

  be_year := extract(year from safe_requested_at at time zone 'Asia/Bangkok')::integer + 543;
  yy := right(be_year::text, 2);
  mm := lpad(extract(month from safe_requested_at at time zone 'Asia/Bangkok')::integer::text, 2, '0');
  seq_key := 'XA' || yy || mm;

  insert into public.production_requisition_document_sequences (sequence_key, last_value, updated_at)
  values (seq_key, safe_requested_count, timezone('utc', now()))
  on conflict (sequence_key)
  do update
    set last_value = public.production_requisition_document_sequences.last_value + safe_requested_count,
        updated_at = timezone('utc', now())
  returning public.production_requisition_document_sequences.last_value into final_last_value;

  start_value := final_last_value - safe_requested_count + 1;

  return query
  select
    seq_key,
    generate_series(start_value, final_last_value),
    seq_key || '/' || lpad(generate_series(start_value, final_last_value)::text, 4, '0');
end;
$$;

drop trigger if exists production_requisition_group_batches_set_updated_at on public.production_requisition_group_batches;
create trigger production_requisition_group_batches_set_updated_at
  before update on public.production_requisition_group_batches
  for each row execute function public.set_updated_at();

drop trigger if exists production_requisition_group_items_set_updated_at on public.production_requisition_group_items;
create trigger production_requisition_group_items_set_updated_at
  before update on public.production_requisition_group_items
  for each row execute function public.set_updated_at();

alter table public.production_requisition_group_batches enable row level security;
alter table public.production_requisition_group_items enable row level security;
alter table public.production_requisition_export_batches enable row level security;
alter table public.production_requisition_document_sequences enable row level security;

drop policy if exists production_requisition_group_batches_read on public.production_requisition_group_batches;
create policy production_requisition_group_batches_read
  on public.production_requisition_group_batches
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_requisition_group_batches_write on public.production_requisition_group_batches;
create policy production_requisition_group_batches_write
  on public.production_requisition_group_batches
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_requisition_group_items_read on public.production_requisition_group_items;
create policy production_requisition_group_items_read
  on public.production_requisition_group_items
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_requisition_group_items_write on public.production_requisition_group_items;
create policy production_requisition_group_items_write
  on public.production_requisition_group_items
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_requisition_export_batches_read on public.production_requisition_export_batches;
create policy production_requisition_export_batches_read
  on public.production_requisition_export_batches
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_requisition_export_batches_write on public.production_requisition_export_batches;
create policy production_requisition_export_batches_write
  on public.production_requisition_export_batches
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_requisition_document_sequences_read on public.production_requisition_document_sequences;
create policy production_requisition_document_sequences_read
  on public.production_requisition_document_sequences
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_requisition_document_sequences_write on public.production_requisition_document_sequences;
create policy production_requisition_document_sequences_write
  on public.production_requisition_document_sequences
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
