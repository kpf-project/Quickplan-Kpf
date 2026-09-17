create table if not exists public.production_erp_export_sequences (
  sequence_key text primary key,
  document_type text not null,
  period_ym text not null,
  last_value integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_erp_export_sequences_type_check
    check (document_type in ('IMM')),
  constraint production_erp_export_sequences_period_check
    check (period_ym ~ '^[0-9]{4}$'),
  constraint production_erp_export_sequences_last_value_check
    check (last_value >= 0)
);

create table if not exists public.production_erp_export_batches (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  source_module text not null,
  date_from date not null,
  date_to date not null,
  file_name text not null,
  status text not null default 'exported',
  document_count integer not null default 0,
  row_count integer not null default 0,
  exported_by uuid null references public.profiles(id) on delete set null,
  exported_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint production_erp_export_batches_type_check
    check (document_type in ('IMM')),
  constraint production_erp_export_batches_source_check
    check (source_module in ('weight_receipt')),
  constraint production_erp_export_batches_status_check
    check (status in ('exported', 'cancelled')),
  constraint production_erp_export_batches_date_check
    check (date_to >= date_from),
  constraint production_erp_export_batches_count_check
    check (document_count >= 0 and row_count >= 0)
);

create table if not exists public.production_erp_export_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_erp_export_batches(id) on delete cascade,
  document_type text not null,
  source_module text not null,
  period_ym text not null,
  running_no integer not null,
  document_no text not null,
  document_date date not null,
  document_note text not null,
  row_count integer not null default 0,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint production_erp_export_documents_type_check
    check (document_type in ('IMM')),
  constraint production_erp_export_documents_source_check
    check (source_module in ('weight_receipt')),
  constraint production_erp_export_documents_period_check
    check (period_ym ~ '^[0-9]{4}$'),
  constraint production_erp_export_documents_running_check
    check (running_no >= 1),
  constraint production_erp_export_documents_doc_no_check
    check (document_no ~ '^IMM[0-9]{4}/[0-9]{4}$'),
  constraint production_erp_export_documents_row_count_check
    check (row_count >= 0),
  constraint production_erp_export_documents_doc_no_uidx unique (document_no)
);

create table if not exists public.production_erp_export_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.production_erp_export_batches(id) on delete cascade,
  document_id uuid not null references public.production_erp_export_documents(id) on delete cascade,
  line_no integer not null,
  source_receipt_id uuid null references public.production_weight_receipts(id) on delete set null,
  document_date date not null,
  document_no text not null,
  branch_code text not null default '00000',
  department_code text not null default 'KP13',
  project_code text not null default '0',
  display_price integer not null default -1,
  trade_code text not null,
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 4),
  unit_weight_kg numeric(12, 3) not null,
  lot_no text not null,
  tracking_no text,
  storage_location text not null default '02',
  production_date date not null,
  expiry_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint production_erp_export_lines_line_no_check
    check (line_no >= 1),
  constraint production_erp_export_lines_qty_check
    check (quantity > 0),
  constraint production_erp_export_lines_weight_check
    check (unit_weight_kg >= 0),
  constraint production_erp_export_lines_doc_no_check
    check (document_no ~ '^IMM[0-9]{4}/[0-9]{4}$'),
  constraint production_erp_export_lines_batch_line_uidx unique (batch_id, line_no)
);

create index if not exists production_erp_export_batches_exported_idx
  on public.production_erp_export_batches (document_type, source_module, exported_at desc);

create index if not exists production_erp_export_documents_period_idx
  on public.production_erp_export_documents (document_type, period_ym, running_no desc);

create index if not exists production_erp_export_documents_date_idx
  on public.production_erp_export_documents (document_date, document_no);

create index if not exists production_erp_export_lines_receipt_idx
  on public.production_erp_export_lines (source_receipt_id)
  where source_receipt_id is not null;

create or replace function public.allocate_erp_export_document_numbers(
  p_document_type text,
  p_document_dates date[]
)
returns table (
  document_date date,
  period_ym text,
  running_no integer,
  document_no text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_type text := upper(coalesce(trim(p_document_type), ''));
  v_period text;
  v_count integer;
  v_final_last_value integer;
  v_start_value integer;
begin
  if v_document_type not in ('IMM') then
    raise exception 'document_type is invalid';
  end if;

  create temporary table tmp_erp_export_dates (
    document_date date not null,
    period_ym text not null,
    ordinal integer not null
  ) on commit drop;

  insert into tmp_erp_export_dates (document_date, period_ym, ordinal)
  select
    source_date,
    right((extract(year from source_date)::integer + 543)::text, 2)
      || lpad(extract(month from source_date)::integer::text, 2, '0') as period_ym,
    row_number() over (
      partition by right((extract(year from source_date)::integer + 543)::text, 2)
        || lpad(extract(month from source_date)::integer::text, 2, '0')
      order by source_date
    ) as ordinal
  from (
    select distinct unnest(coalesce(p_document_dates, array[]::date[])) as source_date
  ) dates
  where source_date is not null;

  for v_period, v_count in
    select tmp.period_ym, count(*)::integer
    from tmp_erp_export_dates tmp
    group by tmp.period_ym
    order by tmp.period_ym
  loop
    insert into public.production_erp_export_sequences (
      sequence_key,
      document_type,
      period_ym,
      last_value,
      updated_at
    )
    values (
      v_document_type || v_period,
      v_document_type,
      v_period,
      v_count,
      timezone('utc', now())
    )
    on conflict (sequence_key)
    do update set
      last_value = public.production_erp_export_sequences.last_value + v_count,
      updated_at = timezone('utc', now())
    returning public.production_erp_export_sequences.last_value into v_final_last_value;

    v_start_value := v_final_last_value - v_count + 1;

    return query
    select
      tmp.document_date,
      tmp.period_ym,
      (v_start_value + tmp.ordinal - 1)::integer as running_no,
      v_document_type
        || tmp.period_ym
        || '/'
        || lpad((v_start_value + tmp.ordinal - 1)::text, 4, '0') as document_no
    from tmp_erp_export_dates tmp
    where tmp.period_ym = v_period
    order by tmp.document_date;
  end loop;
end;
$$;

revoke all on function public.allocate_erp_export_document_numbers(text, date[]) from public;
grant execute on function public.allocate_erp_export_document_numbers(text, date[]) to authenticated;
grant execute on function public.allocate_erp_export_document_numbers(text, date[]) to service_role;

alter table public.production_erp_export_sequences enable row level security;
alter table public.production_erp_export_batches enable row level security;
alter table public.production_erp_export_documents enable row level security;
alter table public.production_erp_export_lines enable row level security;

drop policy if exists production_erp_export_sequences_read on public.production_erp_export_sequences;
create policy production_erp_export_sequences_read
  on public.production_erp_export_sequences
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_erp_export_sequences_write on public.production_erp_export_sequences;
create policy production_erp_export_sequences_write
  on public.production_erp_export_sequences
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_erp_export_batches_read on public.production_erp_export_batches;
create policy production_erp_export_batches_read
  on public.production_erp_export_batches
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_erp_export_batches_write on public.production_erp_export_batches;
create policy production_erp_export_batches_write
  on public.production_erp_export_batches
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_erp_export_documents_read on public.production_erp_export_documents;
create policy production_erp_export_documents_read
  on public.production_erp_export_documents
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_erp_export_documents_write on public.production_erp_export_documents;
create policy production_erp_export_documents_write
  on public.production_erp_export_documents
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists production_erp_export_lines_read on public.production_erp_export_lines;
create policy production_erp_export_lines_read
  on public.production_erp_export_lines
  for select
  using (auth.role() = 'authenticated');

drop policy if exists production_erp_export_lines_write on public.production_erp_export_lines;
create policy production_erp_export_lines_write
  on public.production_erp_export_lines
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
