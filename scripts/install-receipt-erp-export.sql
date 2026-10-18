-- User-run SQL Editor installer. Review first; no receipt or stock changes.
begin;
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

-- User-run only, after the original ERP export schema. No stock writes.
create table if not exists public.production_erp_export_receipts (
  receipt_id uuid primary key,
  batch_id uuid not null references public.production_erp_export_batches(id),
  created_at timestamptz not null default now()
);
alter table public.production_erp_export_receipts enable row level security;
create unique index if not exists production_erp_export_request_uidx
  on public.production_erp_export_batches ((metadata->>'requestId'))
  where metadata ? 'requestId';

-- Preserve legacy exports, including the old aggregated sourceReceiptIds format.
insert into public.production_erp_export_receipts(receipt_id, batch_id)
select distinct on (source_id) source_id::uuid, batch_id from (
  select l.source_receipt_id::text source_id, l.batch_id, l.created_at
  from public.production_erp_export_lines l join public.production_erp_export_batches b on b.id=l.batch_id
  where l.source_receipt_id is not null and b.status='exported'
  union all
  select ids.value, l.batch_id, l.created_at
  from public.production_erp_export_lines l join public.production_erp_export_batches b on b.id=l.batch_id
  cross join lateral jsonb_array_elements_text(coalesce(l.metadata->'sourceReceiptIds','[]')) ids
  where b.status='exported'
) sources where source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
order by source_id, created_at on conflict do nothing;

create or replace function public.commit_wip_receipt_erp_export(
  p_request_id uuid, p_actor uuid, p_filters jsonb, p_rows jsonb,
  p_numbers jsonb, p_reason text, p_request_hash text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_batch uuid; v_existing public.production_erp_export_batches%rowtype;
  v_row jsonb; v_source jsonb; v_receipt public.production_weight_receipts%rowtype;
  v_date date; v_period text; v_run integer; v_last integer; v_no text; v_document uuid;
  v_line integer := 0; v_count integer; v_total numeric; v_source_count integer; v_distinct_count integer;
begin
  -- One short export transaction serializes requests and receipt claims, including retries.
  perform pg_advisory_xact_lock(hashtextextended('kpf-wip-erp-export',0));
  select * into v_existing from public.production_erp_export_batches where metadata->>'requestId'=p_request_id::text;
  if found then
    if v_existing.exported_by is distinct from p_actor or v_existing.metadata->>'requestHash' is distinct from p_request_hash then
      raise exception 'รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว';
    end if;
    return v_existing.id;
  end if;
  if p_actor is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then raise exception 'ข้อมูลส่งออกไม่ครบ'; end if;
  if jsonb_typeof(p_numbers) <> 'object' or (p_numbers <> '{}' and length(trim(p_reason)) not between 5 and 500) then raise exception 'กรุณาระบุเหตุผลแก้เลขเอกสาร'; end if;
  select count(*),count(distinct s->>'id') into v_source_count,v_distinct_count
    from jsonb_array_elements(p_rows) r cross join lateral jsonb_array_elements(r->'sources') s;
  if v_source_count=0 or v_source_count<>v_distinct_count then raise exception 'พบใบชั่งซ้ำในข้อมูลส่งออก'; end if;
  -- Receipt locks prevent cancellation/weight edits between verification and saving the snapshot.
  perform 1 from public.production_weight_receipts where id in (
    select (s->>'id')::uuid from jsonb_array_elements(p_rows) r cross join lateral jsonb_array_elements(r->'sources') s
  ) order by id for update;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if (v_row->>'quantity')::numeric <= 0 or (v_row->>'unitWeightKg')::numeric <> 0 then raise exception 'น้ำหนักส่งออกไม่ถูกต้อง'; end if;
    v_total := 0;
    for v_source in select value from jsonb_array_elements(v_row->'sources') loop
      select * into v_receipt from public.production_weight_receipts where id=(v_source->>'id')::uuid;
      if not found then raise exception 'ไม่พบใบชั่ง กรุณา Preview ใหม่'; end if;
      if v_receipt.status <> 'recorded' or coalesce(v_receipt.metadata->>'isReturn','false') <> 'false'
        or coalesce(v_receipt.metadata->>'isTest','false') <> 'false'
        or v_receipt.net_weight_kg is distinct from (v_source->>'netWeightKg')::numeric
        or v_receipt.weighed_at is distinct from (v_source->>'weighedAt')::timestamptz
        or v_receipt.product_config_id is distinct from (v_source->>'productConfigId')::uuid
        or v_receipt.lot_id is distinct from (v_source->>'lotId')::uuid
        or v_receipt.barcode is distinct from (v_source->>'barcode')
        or (v_receipt.weighed_at at time zone 'Asia/Bangkok')::date <> (v_row->>'documentDate')::date then
        raise exception 'ใบชั่งเปลี่ยนจากพรีวิว กรุณา Preview ใหม่';
      end if;
      if exists(select 1 from public.production_erp_export_receipts where receipt_id=v_receipt.id) then raise exception 'มีใบชั่งที่เคยส่งออกแล้ว กรุณาดาวน์โหลดเอกสารเดิมจากประวัติ'; end if;
      v_total := v_total + round(v_receipt.net_weight_kg,3);
    end loop;
    if round(v_total,3) is distinct from (v_row->>'quantity')::numeric then raise exception 'ยอดรวมไม่ตรงใบชั่ง'; end if;
  end loop;

  insert into public.production_erp_export_batches(document_type,source_module,date_from,date_to,file_name,status,document_count,row_count,exported_by,metadata)
  values('IMM','weight_receipt',(p_filters->>'dateFrom')::date,(p_filters->>'dateTo')::date,
    'erp_wip_receipt_'||replace(p_filters->>'dateFrom','-','')||'_'||replace(p_filters->>'dateTo','-','')||'.xlsx',
    'exported',(select count(distinct r->>'documentDate') from jsonb_array_elements(p_rows) r),jsonb_array_length(p_rows),p_actor,
    jsonb_build_object('filters',p_filters,'requestId',p_request_id,'requestHash',p_request_hash,'formatVersion',2,'overrideReason',p_reason,
      'totalWeightKg',(select sum((r->>'quantity')::numeric) from jsonb_array_elements(p_rows) r))) returning id into v_batch;

  for v_date in select distinct (r->>'documentDate')::date from jsonb_array_elements(p_rows) r order by 1 loop
    v_period := right((extract(year from v_date)::int+543)::text,2)||to_char(v_date,'MM');
    insert into public.production_erp_export_sequences(sequence_key,document_type,period_ym,last_value) values('IMM'||v_period,'IMM',v_period,0) on conflict do nothing;
    select greatest(s.last_value,coalesce((select max(d.running_no) from public.production_erp_export_documents d where d.document_type='IMM' and d.period_ym=v_period),0))
      into v_last from public.production_erp_export_sequences s where sequence_key='IMM'||v_period for update;
    if p_numbers ? v_date::text then
      v_no := p_numbers->>v_date::text;
      if v_no !~ ('^IMM'||v_period||'/[0-9]{4}$') then raise exception 'เลขเอกสารไม่ตรงเดือนรับเข้า'; end if;
      v_run := right(v_no,4)::integer;
    else v_run := v_last+1; v_no := 'IMM'||v_period||'/'||lpad(v_run::text,4,'0'); end if;
    if v_run not between 1 and 9999 then raise exception 'เลขเอกสารประจำเดือนเต็มหรือไม่ถูกต้อง'; end if;
    if exists(select 1 from public.production_erp_export_documents where document_no=v_no) then raise exception 'เลขเอกสารนี้ถูกใช้แล้ว'; end if;
    update public.production_erp_export_sequences set last_value=greatest(v_last,v_run),updated_at=now() where sequence_key='IMM'||v_period;
    select count(*) into v_count from jsonb_array_elements(p_rows) r where (r->>'documentDate')::date=v_date;
    insert into public.production_erp_export_documents(batch_id,document_type,source_module,period_ym,running_no,document_no,document_date,document_note,row_count,created_by,metadata)
    values(v_batch,'IMM','weight_receipt',v_period,v_run,v_no,v_date,'รับ WIP ของวันที่ '||to_char(v_date,'DD/MM/')||(extract(year from v_date)::int+543)::text,v_count,p_actor,
      jsonb_build_object('manualOverride',p_numbers ? v_date::text,'reason',p_reason)) returning id into v_document;
    for v_row in select value from jsonb_array_elements(p_rows) where (value->>'documentDate')::date=v_date loop
      v_line:=v_line+1;
      insert into public.production_erp_export_lines(batch_id,document_id,line_no,document_date,document_no,branch_code,department_code,project_code,display_price,trade_code,quantity,unit_weight_kg,lot_no,storage_location,production_date,expiry_date,metadata)
      values(v_batch,v_document,v_line,v_date,v_no,'00000','KP13','0',-1,v_row->>'tradeCode',(v_row->>'quantity')::numeric,0,v_row->>'lotNo','02',v_date,(v_date+interval '1 year')::date,
        jsonb_build_object('sourceReceiptIds',v_row->'sourceReceiptIds','barcodes',v_row->'barcodes','productName',v_row->>'productName'));
      insert into public.production_erp_export_receipts(receipt_id,batch_id)
        select (s->>'id')::uuid,v_batch from jsonb_array_elements(v_row->'sources') s;
    end loop;
  end loop;
  return v_batch;
end;
$$;

revoke all on function public.commit_wip_receipt_erp_export(uuid,uuid,jsonb,jsonb,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.commit_wip_receipt_erp_export(uuid,uuid,jsonb,jsonb,jsonb,text,text) to service_role;
revoke all on function public.allocate_erp_export_document_numbers(text,date[]) from public, anon, authenticated, service_role;
revoke all on public.production_erp_export_sequences,public.production_erp_export_batches,public.production_erp_export_documents,public.production_erp_export_lines,public.production_erp_export_receipts from public, anon, authenticated, service_role;
grant select on public.production_erp_export_sequences,public.production_erp_export_batches,public.production_erp_export_documents,public.production_erp_export_lines,public.production_erp_export_receipts to service_role;

commit;
NOTIFY pgrst, 'reload schema';
