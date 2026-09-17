create table if not exists public.production_stock_issue_documents (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  department_code text not null,
  issue_type text not null,
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
  constraint production_stock_issue_documents_type_check
    check (issue_type in ('KPF', 'PB', 'PRISON')),
  constraint production_stock_issue_documents_status_check
    check (status in ('confirmed', 'voided')),
  constraint production_stock_issue_documents_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_stock_issue_documents_department_date_idx
  on public.production_stock_issue_documents (department_id, issue_date desc, issue_type);

create index if not exists production_stock_issue_documents_status_idx
  on public.production_stock_issue_documents (status, issued_at desc);

drop trigger if exists production_stock_issue_documents_set_updated_at
  on public.production_stock_issue_documents;
create trigger production_stock_issue_documents_set_updated_at
  before update on public.production_stock_issue_documents
  for each row execute function public.set_updated_at();

alter table public.production_stock_issue_documents enable row level security;

create table if not exists public.production_stock_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_document_id uuid not null references public.production_stock_issue_documents(id) on delete cascade,
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
  constraint production_stock_issue_items_quantity_positive
    check (quantity > 0),
  constraint production_stock_issue_items_weight_non_negative
    check (weight_kg >= 0),
  constraint production_stock_issue_items_status_check
    check (status in ('confirmed', 'voided')),
  constraint production_stock_issue_items_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists production_stock_issue_items_issue_document_idx
  on public.production_stock_issue_items (issue_document_id, status, issued_at desc);

create index if not exists production_stock_issue_items_source_receipt_idx
  on public.production_stock_issue_items (source_receipt_id);

create index if not exists production_stock_issue_items_product_lot_idx
  on public.production_stock_issue_items (product_code, lot_no, issued_at desc);

create unique index if not exists production_stock_issue_items_active_receipt_uidx
  on public.production_stock_issue_items (source_receipt_id)
  where status = 'confirmed';

drop trigger if exists production_stock_issue_items_set_updated_at
  on public.production_stock_issue_items;
create trigger production_stock_issue_items_set_updated_at
  before update on public.production_stock_issue_items
  for each row execute function public.set_updated_at();

alter table public.production_stock_issue_items enable row level security;

create or replace view public.production_stock_issue_report_lines_v as
select
  documents.id as issue_document_id,
  items.id as issue_item_id,
  documents.issue_no,
  documents.department_id,
  documents.department_code,
  documents.issue_type,
  documents.issue_date,
  documents.issued_at as document_issued_at,
  documents.status as document_status,
  documents.remark as document_remark,
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
from public.production_stock_issue_documents documents
join public.production_stock_issue_items items
  on items.issue_document_id = documents.id;

create or replace function public.generate_production_stock_reference_no(prefix text)
returns text
language plpgsql
as $$
declare
  normalized_prefix text := upper(regexp_replace(coalesce(prefix, 'DOC'), '[^A-Z0-9]+', '', 'g'));
begin
  if normalized_prefix = '' then
    normalized_prefix := 'DOC';
  end if;

  return normalized_prefix
    || '-'
    || to_char(timezone('Asia/Bangkok', now()), 'YYYYMMDD-HH24MISSMS')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
end;
$$;

create or replace function public.create_production_stock_issue(
  p_barcode text,
  p_issue_type text,
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
  v_issue_type text := upper(trim(coalesce(p_issue_type, '')));
  v_barcode text := upper(trim(coalesce(p_barcode, '')));
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_issue_no text := public.generate_production_stock_reference_no('ISS');
  v_movement_no text := public.generate_production_stock_reference_no('MVISS');
  v_document_id uuid;
  v_issue_item_id uuid;
  v_receipt record;
begin
  if v_barcode = '' then
    raise exception using
      errcode = 'P0001',
      message = 'กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิก';
  end if;

  if v_issue_type not in ('KPF', 'PB', 'PRISON') then
    raise exception using
      errcode = 'P0001',
      message = 'ประเภทการเบิกไม่ถูกต้อง';
  end if;

  select
    receipts.id as receipt_id,
    receipts.barcode,
    receipts.net_weight_kg,
    receipts.weighed_at,
    scale_products.department_id,
    departments.code as department_code,
    scale_products.sku_code as product_code,
    products.sku_name as product_name,
    products.uom_name,
    products.iccat_code as category_code,
    lots.lot_code as lot_no
  into v_receipt
  from public.production_weight_receipts receipts
  join public.production_weight_scale_products scale_products
    on scale_products.id = receipts.product_config_id
  join public.production_weight_scale_lots lots
    on lots.id = receipts.lot_id
  join public.products_cache products
    on products.sku_code = scale_products.sku_code
  join public.production_departments departments
    on departments.id = scale_products.department_id
  where upper(coalesce(receipts.barcode, '')) = v_barcode
    and receipts.status = 'recorded'
    and departments.code = 'DEP-BIS'
    and products.iccat_code = '03'
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบบาร์โค้ดสำหรับเบิก หรือบาร์โค้ดนี้อยู่นอกขอบเขต DEP-BIS / หมวด 03';
  end if;

  insert into public.production_stock_issue_documents (
    issue_no,
    department_id,
    department_code,
    issue_type,
    issue_date,
    issued_at,
    status,
    remark,
    metadata,
    created_by
  )
  values (
    v_issue_no,
    v_receipt.department_id,
    v_receipt.department_code,
    v_issue_type,
    v_issue_date,
    v_now,
    'confirmed',
    v_remark,
    jsonb_build_object(
      'createdFrom', 'barcode_scan',
      'barcode', v_receipt.barcode
    ),
    p_actor_user_id
  )
  returning id into v_document_id;

  begin
    insert into public.production_stock_issue_items (
      issue_document_id,
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
      v_receipt.receipt_id,
      v_receipt.barcode,
      v_receipt.product_code,
      v_receipt.product_name,
      v_receipt.category_code,
      v_receipt.lot_no,
      v_receipt.uom_name,
      1,
      v_receipt.net_weight_kg,
      v_now,
      'confirmed',
      jsonb_build_object(
        'issueType', v_issue_type,
        'receiptWeighedAt', v_receipt.weighed_at
      ),
      p_actor_user_id
    )
    returning id into v_issue_item_id;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0001',
        message = 'บาร์โค้ดนี้ถูกเบิกไปแล้ว';
  end;

  insert into public.production_stock_movements (
    movement_no,
    movement_type,
    movement_date,
    movement_at,
    department_id,
    department_code,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    uom_name,
    quantity_out,
    weight_out_kg,
    source_document_type,
    source_document_no,
    reference_type,
    reference_no,
    remark,
    metadata,
    created_by
  )
  values (
    v_movement_no,
    'issue_out',
    v_issue_date,
    v_now,
    v_receipt.department_id,
    v_receipt.department_code,
    v_receipt.product_code,
    v_receipt.product_name,
    v_receipt.category_code,
    v_receipt.lot_no,
    v_receipt.uom_name,
    1,
    v_receipt.net_weight_kg,
    'stock_issue',
    v_issue_no,
    'weight_receipt',
    v_receipt.barcode,
    v_remark,
    jsonb_build_object(
      'issueDocumentId', v_document_id,
      'issueItemId', v_issue_item_id,
      'issueType', v_issue_type,
      'barcode', v_receipt.barcode,
      'sourceReceiptId', v_receipt.receipt_id
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'issueDocumentId', v_document_id,
    'issueItemId', v_issue_item_id,
    'issueNo', v_issue_no,
    'issueType', v_issue_type,
    'issueDate', v_issue_date,
    'issuedAt', v_now,
    'barcode', v_receipt.barcode,
    'productCode', v_receipt.product_code,
    'productName', v_receipt.product_name,
    'lotNo', v_receipt.lot_no,
    'quantity', 1,
    'weightKg', v_receipt.net_weight_kg
  );
end;
$$;

create or replace function public.cancel_production_stock_issue_item(
  p_issue_item_id uuid,
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
  v_movement_no text := public.generate_production_stock_reference_no('MVREV');
  v_issue_item record;
begin
  if p_issue_item_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการเบิกที่ต้องการยกเลิก';
  end if;

  select
    items.id as issue_item_id,
    items.issue_document_id,
    items.source_receipt_id,
    items.barcode,
    items.product_code,
    items.product_name_snapshot,
    items.category_code,
    items.lot_no,
    items.uom_name,
    items.quantity,
    items.weight_kg,
    items.status as item_status,
    documents.issue_no,
    documents.department_id,
    documents.department_code,
    documents.issue_type,
    documents.issue_date,
    documents.status as document_status
  into v_issue_item
  from public.production_stock_issue_items items
  join public.production_stock_issue_documents documents
    on documents.id = items.issue_document_id
  where items.id = p_issue_item_id
  limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่พบรายการเบิกที่ต้องการยกเลิก';
  end if;

  if v_issue_item.item_status <> 'confirmed' or v_issue_item.document_status <> 'confirmed' then
    raise exception using
      errcode = 'P0001',
      message = 'รายการเบิกนี้ถูกยกเลิกไปแล้ว';
  end if;

  update public.production_stock_issue_items
  set
    status = 'voided',
    voided_at = v_now,
    voided_by = p_actor_user_id,
    void_reason = v_void_reason
  where id = v_issue_item.issue_item_id;

  update public.production_stock_issue_documents
  set
    status = case
      when not exists (
        select 1
        from public.production_stock_issue_items
        where issue_document_id = v_issue_item.issue_document_id
          and status = 'confirmed'
      ) then 'voided'
      else status
    end,
    voided_at = case
      when not exists (
        select 1
        from public.production_stock_issue_items
        where issue_document_id = v_issue_item.issue_document_id
          and status = 'confirmed'
      ) then v_now
      else voided_at
    end,
    voided_by = case
      when not exists (
        select 1
        from public.production_stock_issue_items
        where issue_document_id = v_issue_item.issue_document_id
          and status = 'confirmed'
      ) then p_actor_user_id
      else voided_by
    end,
    void_reason = case
      when not exists (
        select 1
        from public.production_stock_issue_items
        where issue_document_id = v_issue_item.issue_document_id
          and status = 'confirmed'
      ) then coalesce(v_void_reason, void_reason)
      else void_reason
    end
  where id = v_issue_item.issue_document_id;

  insert into public.production_stock_movements (
    movement_no,
    movement_type,
    movement_date,
    movement_at,
    department_id,
    department_code,
    product_code,
    product_name_snapshot,
    category_code,
    lot_no,
    uom_name,
    quantity_in,
    weight_in_kg,
    source_document_type,
    source_document_no,
    reference_type,
    reference_no,
    remark,
    metadata,
    created_by
  )
  values (
    v_movement_no,
    'adjustment_in',
    v_issue_item.issue_date,
    v_now,
    v_issue_item.department_id,
    v_issue_item.department_code,
    v_issue_item.product_code,
    v_issue_item.product_name_snapshot,
    v_issue_item.category_code,
    v_issue_item.lot_no,
    v_issue_item.uom_name,
    v_issue_item.quantity,
    v_issue_item.weight_kg,
    'stock_issue_void',
    v_issue_item.issue_no,
    'stock_issue_item',
    v_issue_item.issue_item_id::text,
    v_void_reason,
    jsonb_build_object(
      'issueDocumentId', v_issue_item.issue_document_id,
      'issueItemId', v_issue_item.issue_item_id,
      'issueType', v_issue_item.issue_type,
      'barcode', v_issue_item.barcode,
      'sourceReceiptId', v_issue_item.source_receipt_id,
      'reversedMovementType', 'issue_out'
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'issueItemId', v_issue_item.issue_item_id,
    'issueDocumentId', v_issue_item.issue_document_id,
    'issueNo', v_issue_item.issue_no,
    'issueType', v_issue_item.issue_type,
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
