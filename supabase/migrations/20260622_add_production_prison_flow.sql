create table if not exists public.production_prison_issue_documents (
  id uuid primary key default gen_random_uuid(),
  prison_issue_no text not null unique,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  department_code text not null,
  issue_date date not null,
  issued_at timestamptz not null default timezone('utc', now()),
  status text not null default 'confirmed',
  remark text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_prison_issue_documents_status_check
    check (status in ('confirmed', 'voided')),
  constraint production_prison_issue_documents_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_prison_issue_documents_department_date_idx
  on public.production_prison_issue_documents (department_id, issue_date desc);

create index if not exists production_prison_issue_documents_status_idx
  on public.production_prison_issue_documents (status, issued_at desc);

drop trigger if exists production_prison_issue_documents_set_updated_at
  on public.production_prison_issue_documents;
create trigger production_prison_issue_documents_set_updated_at
  before update on public.production_prison_issue_documents
  for each row execute function public.set_updated_at();

alter table public.production_prison_issue_documents enable row level security;

create table if not exists public.production_prison_issue_items (
  id uuid primary key default gen_random_uuid(),
  prison_issue_document_id uuid not null references public.production_prison_issue_documents(id) on delete cascade,
  source_issue_item_id uuid not null references public.production_stock_issue_items(id) on delete restrict,
  source_issue_document_id uuid not null references public.production_stock_issue_documents(id) on delete restrict,
  source_receipt_id uuid not null references public.production_weight_receipts(id) on delete restrict,
  barcode text not null,
  product_code text not null references public.products_cache(sku_code) on delete restrict,
  product_name_snapshot text not null,
  category_code text not null default '03',
  lot_no text not null,
  uom_name text,
  quantity numeric(14,3) not null default 1,
  weight_kg numeric(14,3) not null default 0,
  issued_at timestamptz not null default timezone('utc', now()),
  status text not null default 'confirmed',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint production_prison_issue_items_quantity_positive
    check (quantity > 0),
  constraint production_prison_issue_items_weight_non_negative
    check (weight_kg >= 0),
  constraint production_prison_issue_items_status_check
    check (status in ('confirmed', 'voided')),
  constraint production_prison_issue_items_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_prison_issue_items_issue_document_idx
  on public.production_prison_issue_items (prison_issue_document_id, status, issued_at desc);

create index if not exists production_prison_issue_items_source_issue_idx
  on public.production_prison_issue_items (source_issue_item_id);

create index if not exists production_prison_issue_items_product_lot_idx
  on public.production_prison_issue_items (product_code, lot_no, issued_at desc);

create index if not exists production_prison_issue_items_barcode_idx
  on public.production_prison_issue_items (barcode);

create unique index if not exists production_prison_issue_items_active_source_uidx
  on public.production_prison_issue_items (source_issue_item_id)
  where status = 'confirmed';

drop trigger if exists production_prison_issue_items_set_updated_at
  on public.production_prison_issue_items;
create trigger production_prison_issue_items_set_updated_at
  before update on public.production_prison_issue_items
  for each row execute function public.set_updated_at();

alter table public.production_prison_issue_items enable row level security;

create or replace view public.production_prison_issue_report_lines_v as
select
  documents.id as prison_issue_document_id,
  items.id as prison_issue_item_id,
  documents.prison_issue_no,
  documents.department_id,
  documents.department_code,
  documents.issue_date,
  documents.issued_at as document_issued_at,
  documents.status as document_status,
  documents.remark as document_remark,
  items.source_issue_document_id,
  items.source_issue_item_id,
  items.source_receipt_id,
  items.barcode,
  items.product_code,
  items.product_name_snapshot,
  items.category_code,
  items.lot_no,
  items.uom_name,
  items.quantity,
  items.weight_kg,
  items.issued_at,
  items.status as item_status,
  items.voided_at,
  items.void_reason,
  items.created_at
from public.production_prison_issue_documents documents
join public.production_prison_issue_items items
  on items.prison_issue_document_id = documents.id;

create or replace view public.production_prison_inbound_report_lines_v as
select
  inbound.issue_document_id as inbound_document_id,
  inbound.issue_item_id as inbound_item_id,
  inbound.issue_no as inbound_no,
  inbound.department_id,
  inbound.department_code,
  inbound.issue_date as inbound_date,
  inbound.document_issued_at as inbound_document_issued_at,
  inbound.document_status as inbound_document_status,
  inbound.item_status as inbound_item_status,
  inbound.barcode,
  inbound.product_code,
  inbound.product_name_snapshot,
  inbound.category_code,
  inbound.lot_no,
  inbound.uom_name,
  inbound.quantity,
  inbound.weight_kg,
  prison_items.id as prison_issue_item_id,
  prison_docs.id as prison_issue_document_id,
  prison_docs.prison_issue_no,
  prison_docs.issue_date as prison_issue_date,
  prison_docs.status as prison_document_status,
  prison_items.status as prison_item_status,
  prison_items.issued_at as prison_issued_at
from public.production_stock_issue_report_lines_v inbound
left join public.production_prison_issue_items prison_items
  on prison_items.source_issue_item_id = inbound.issue_item_id
  and prison_items.status = 'confirmed'
left join public.production_prison_issue_documents prison_docs
  on prison_docs.id = prison_items.prison_issue_document_id
where inbound.issue_type = 'PRISON';

create or replace function public.create_production_prison_issue(
  p_barcode text,
  p_actor_user_id uuid default null,
  p_remark text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_issue_date date := (timezone('Asia/Bangkok', v_now))::date;
  v_barcode text := upper(trim(coalesce(p_barcode, '')));
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_issue_no text := public.generate_production_stock_reference_no('PIS');
  v_document_id uuid;
  v_issue_item_id uuid;
  v_inbound record;
begin
  if v_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิกเรือนจำ';
  end if;

  select
    inbound.inbound_document_id,
    inbound.inbound_item_id,
    inbound.inbound_no,
    inbound.department_id,
    inbound.department_code,
    inbound.barcode,
    inbound.product_code,
    inbound.product_name_snapshot,
    inbound.category_code,
    inbound.lot_no,
    inbound.uom_name,
    inbound.quantity,
    inbound.weight_kg,
    inbound.prison_issue_item_id
  into v_inbound
  from public.production_prison_inbound_report_lines_v inbound
  where upper(coalesce(inbound.barcode, '')) = v_barcode
    and inbound.inbound_document_status = 'confirmed'
    and inbound.inbound_item_status = 'confirmed'
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบบาร์โค้ดรับเข้าเรือนจำ หรือรายการนี้ไม่พร้อมเบิก';
  end if;

  if v_inbound.prison_issue_item_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'บาร์โค้ดนี้ถูกเบิกออกเรือนจำแล้ว';
  end if;

  insert into public.production_prison_issue_documents (
    prison_issue_no,
    department_id,
    department_code,
    issue_date,
    issued_at,
    status,
    remark,
    metadata,
    created_by
  )
  values (
    v_issue_no,
    v_inbound.department_id,
    v_inbound.department_code,
    v_issue_date,
    v_now,
    'confirmed',
    v_remark,
    jsonb_build_object(
      'createdFrom', 'barcode_scan',
      'barcode', v_inbound.barcode,
      'sourceInboundNo', v_inbound.inbound_no
    ),
    p_actor_user_id
  )
  returning id into v_document_id;

  begin
    insert into public.production_prison_issue_items (
      prison_issue_document_id,
      source_issue_item_id,
      source_issue_document_id,
      source_receipt_id,
      barcode,
      product_code,
      product_name_snapshot,
      category_code,
      lot_no,
      uom_name,
      quantity,
      weight_kg,
      issued_at,
      status,
      metadata,
      created_by
    )
    values (
      v_document_id,
      v_inbound.inbound_item_id,
      v_inbound.inbound_document_id,
      (
        select source_receipt_id
        from public.production_stock_issue_items
        where id = v_inbound.inbound_item_id
      ),
      v_inbound.barcode,
      v_inbound.product_code,
      v_inbound.product_name_snapshot,
      v_inbound.category_code,
      v_inbound.lot_no,
      v_inbound.uom_name,
      v_inbound.quantity,
      v_inbound.weight_kg,
      v_now,
      'confirmed',
      jsonb_build_object(
        'sourceInboundNo', v_inbound.inbound_no,
        'sourceIssueItemId', v_inbound.inbound_item_id
      ),
      p_actor_user_id
    )
    returning id into v_issue_item_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'บาร์โค้ดนี้ถูกเบิกออกเรือนจำแล้ว';
  end;

  return jsonb_build_object(
    'prisonIssueDocumentId', v_document_id,
    'prisonIssueItemId', v_issue_item_id,
    'prisonIssueNo', v_issue_no,
    'issueDate', v_issue_date,
    'issuedAt', v_now,
    'barcode', v_inbound.barcode,
    'productCode', v_inbound.product_code,
    'productName', v_inbound.product_name_snapshot,
    'lotNo', v_inbound.lot_no,
    'quantity', v_inbound.quantity,
    'weightKg', v_inbound.weight_kg
  );
end;
$$;

create or replace function public.cancel_production_prison_issue_item(
  p_prison_issue_item_id uuid,
  p_actor_user_id uuid default null,
  p_void_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_void_reason text := nullif(trim(coalesce(p_void_reason, '')), '');
  v_issue_item record;
begin
  if p_prison_issue_item_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการเบิกเรือนจำที่ต้องการยกเลิก';
  end if;

  select
    items.id as prison_issue_item_id,
    items.prison_issue_document_id,
    items.source_issue_item_id,
    items.barcode,
    items.product_code,
    items.product_name_snapshot,
    items.category_code,
    items.lot_no,
    items.uom_name,
    items.quantity,
    items.weight_kg,
    items.status as item_status,
    documents.prison_issue_no,
    documents.department_id,
    documents.department_code,
    documents.issue_date,
    documents.status as document_status
  into v_issue_item
  from public.production_prison_issue_items items
  join public.production_prison_issue_documents documents
    on documents.id = items.prison_issue_document_id
  where items.id = p_prison_issue_item_id
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการเบิกเรือนจำที่ต้องการยกเลิก';
  end if;

  if v_issue_item.item_status <> 'confirmed' or v_issue_item.document_status <> 'confirmed' then
    raise exception using
      errcode = 'P0001',
      message = 'รายการเบิกเรือนจำนี้ถูกยกเลิกไปแล้ว';
  end if;

  update public.production_prison_issue_items
  set
    status = 'voided',
    voided_at = v_now,
    voided_by = p_actor_user_id,
    void_reason = v_void_reason
  where id = v_issue_item.prison_issue_item_id;

  update public.production_prison_issue_documents
  set
    status = case
      when not exists (
        select 1
        from public.production_prison_issue_items
        where prison_issue_document_id = v_issue_item.prison_issue_document_id
          and status = 'confirmed'
      ) then 'voided'
      else status
    end,
    voided_at = case
      when not exists (
        select 1
        from public.production_prison_issue_items
        where prison_issue_document_id = v_issue_item.prison_issue_document_id
          and status = 'confirmed'
      ) then v_now
      else voided_at
    end,
    voided_by = case
      when not exists (
        select 1
        from public.production_prison_issue_items
        where prison_issue_document_id = v_issue_item.prison_issue_document_id
          and status = 'confirmed'
      ) then p_actor_user_id
      else voided_by
    end,
    void_reason = case
      when not exists (
        select 1
        from public.production_prison_issue_items
        where prison_issue_document_id = v_issue_item.prison_issue_document_id
          and status = 'confirmed'
      ) then coalesce(v_void_reason, void_reason)
      else void_reason
    end
  where id = v_issue_item.prison_issue_document_id;

  return jsonb_build_object(
    'prisonIssueItemId', v_issue_item.prison_issue_item_id,
    'prisonIssueDocumentId', v_issue_item.prison_issue_document_id,
    'prisonIssueNo', v_issue_item.prison_issue_no,
    'barcode', v_issue_item.barcode,
    'productCode', v_issue_item.product_code,
    'productName', v_issue_item.product_name_snapshot,
    'lotNo', v_issue_item.lot_no,
    'quantity', v_issue_item.quantity,
    'weightKg', v_issue_item.weight_kg,
    'voidedAt', v_now
  );
end;
$$;

create or replace function public.cancel_production_prison_inbound_item(
  p_source_issue_item_id uuid,
  p_actor_user_id uuid default null,
  p_void_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_void_reason text := nullif(trim(coalesce(p_void_reason, '')), '');
  v_inbound record;
  v_cancel_result jsonb;
begin
  if p_source_issue_item_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการรับเข้าเรือนจำที่ต้องการยกเลิก';
  end if;

  select
    inbound.inbound_item_id,
    inbound.inbound_document_id,
    inbound.inbound_no,
    inbound.barcode,
    inbound.product_code,
    inbound.product_name_snapshot,
    inbound.lot_no,
    inbound.quantity,
    inbound.weight_kg,
    inbound.inbound_document_status,
    inbound.inbound_item_status,
    inbound.prison_issue_item_id
  into v_inbound
  from public.production_prison_inbound_report_lines_v inbound
  where inbound.inbound_item_id = p_source_issue_item_id
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการรับเข้าเรือนจำที่ต้องการยกเลิก';
  end if;

  if v_inbound.inbound_document_status <> 'confirmed' or v_inbound.inbound_item_status <> 'confirmed' then
    raise exception using
      errcode = 'P0001',
      message = 'รายการรับเข้าเรือนจำนี้ถูกยกเลิกไปแล้ว';
  end if;

  if v_inbound.prison_issue_item_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'รายการนี้ถูกเบิกออกเรือนจำแล้ว ไม่สามารถยกเลิกชั่งได้';
  end if;

  v_cancel_result := public.cancel_production_stock_issue_item(
    p_source_issue_item_id,
    p_actor_user_id,
    v_void_reason
  );

  return coalesce(v_cancel_result, '{}'::jsonb) || jsonb_build_object(
    'cancelType', 'prison_inbound',
    'canceledAt', v_now
  );
end;
$$;
