create table if not exists public.production_piece_rate_prison_receipt_counters (
  receipt_date date primary key,
  last_sequence integer not null default 0 check (last_sequence between 0 and 999),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.production_piece_rate_prison_receipts (
  id uuid primary key default gen_random_uuid(),
  document_no text not null unique,
  receipt_date date not null,
  product_code text not null check (product_code = 'WKB-0002-2'),
  product_name_snapshot text not null,
  weight_uom_snapshot text not null,
  total_tray_quantity numeric(14, 3) not null check (total_tray_quantity > 0),
  total_weight_kg numeric(14, 3) not null check (total_weight_kg > 0),
  item_count integer not null check (item_count > 0),
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.production_piece_rate_prison_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.production_piece_rate_prison_receipts(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  lot_no text not null check (length(trim(lot_no)) between 1 and 100),
  tray_quantity numeric(14, 3) not null check (tray_quantity > 0),
  weight_kg numeric(14, 3) not null check (weight_kg > 0),
  remark text,
  stock_movement_id uuid not null references public.production_stock_movements(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (receipt_id, line_no)
);

create index if not exists production_piece_rate_prison_receipts_date_idx
  on public.production_piece_rate_prison_receipts (receipt_date desc, created_at desc);
create index if not exists production_piece_rate_prison_receipt_items_receipt_idx
  on public.production_piece_rate_prison_receipt_items (receipt_id, line_no);
create unique index if not exists production_stock_movements_prison_receipt_source_uidx
  on public.production_stock_movements (source_document_type, source_document_no)
  where source_document_type = 'piece_rate_prison_receipt';

alter table public.production_piece_rate_prison_receipt_counters enable row level security;
alter table public.production_piece_rate_prison_receipts enable row level security;
alter table public.production_piece_rate_prison_receipt_items enable row level security;

revoke all on table public.production_piece_rate_prison_receipt_counters from public, anon, authenticated;
revoke all on table public.production_piece_rate_prison_receipts from public, anon, authenticated;
revoke all on table public.production_piece_rate_prison_receipt_items from public, anon, authenticated;
grant select, insert, update on table public.production_piece_rate_prison_receipt_counters to service_role;
grant select, insert on table public.production_piece_rate_prison_receipts to service_role;
grant select, insert on table public.production_piece_rate_prison_receipt_items to service_role;

-- Make the document tables discoverable by PostgREST. RLS remains enabled and
-- no anon/authenticated policies are created, so browser roles cannot read rows.
grant select on table public.production_piece_rate_prison_receipts to anon, authenticated;
grant select on table public.production_piece_rate_prison_receipt_items to anon, authenticated;

create or replace function public.create_piece_rate_prison_receipt_atomic(
  p_items jsonb,
  p_actor_user_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (timezone('Asia/Bangkok', now()))::date;
  v_now timestamptz := timezone('utc', now());
  v_sequence integer;
  v_document_no text;
  v_product record;
  v_department record;
  v_receipt_id uuid;
  v_item jsonb;
  v_line_no integer := 0;
  v_lot_no text;
  v_tray_quantity numeric(14, 3);
  v_weight_kg numeric(14, 3);
  v_remark text;
  v_movement_id uuid;
  v_total_trays numeric(14, 3) := 0;
  v_total_weight numeric(14, 3) := 0;
  v_item_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'กรุณาระบุรายการรับเข้าอย่างน้อย 1 LOT';
  end if;

  select sku_code, sku_name, uom_name, iccat_code
  into v_product
  from public.products_cache
  where upper(trim(sku_code)) = 'WKB-0002-2'
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบสินค้า WKB-0002-2 ในข้อมูลสินค้า';
  end if;

  select departments.id, departments.code
  into v_department
  from public.production_department_products mappings
  join public.production_departments departments on departments.id = mappings.department_id
  where upper(trim(mappings.sku_code)) = 'WKB-0002-2'
    and departments.deleted_at is null
    and departments.is_active = true
  order by mappings.is_owner desc, mappings.id
  limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'สินค้า WKB-0002-2 ยังไม่ได้ผูกแผนกเจ้าของสต็อก';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_lot_no := trim(coalesce(v_item->>'lotNo', ''));
    v_tray_quantity := round(coalesce(nullif(v_item->>'quantity', '')::numeric, 0), 3);
    v_weight_kg := round(coalesce(nullif(v_item->>'weightKg', '')::numeric, 0), 3);
    if v_lot_no = '' then
      raise exception using errcode = 'P0001', message = 'กรุณาระบุหมายเลข LOT ให้ครบทุกแถว';
    end if;
    if v_tray_quantity <= 0 or trunc(v_tray_quantity) <> v_tray_quantity then
      raise exception using errcode = 'P0001', message = 'จำนวนกระบะต้องเป็นจำนวนเต็มมากกว่า 0';
    end if;
    if v_weight_kg <= 0 then
      raise exception using errcode = 'P0001', message = 'น้ำหนักต้องมากกว่า 0 กก.';
    end if;
    v_total_trays := v_total_trays + v_tray_quantity;
    v_total_weight := v_total_weight + v_weight_kg;
  end loop;

  v_item_count := jsonb_array_length(p_items);
  insert into public.production_piece_rate_prison_receipt_counters (receipt_date, last_sequence)
  values (v_today, 1)
  on conflict (receipt_date) do update
    set last_sequence = public.production_piece_rate_prison_receipt_counters.last_sequence + 1,
        updated_at = v_now
  returning last_sequence into v_sequence;

  if v_sequence > 999 then
    raise exception using errcode = 'P0001', message = 'เลขเอกสารรับเข้าเรือนจำประจำวันครบ 999 รายการแล้ว';
  end if;
  v_document_no := 'PRW-' || to_char(v_today, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');

  insert into public.production_piece_rate_prison_receipts (
    document_no, receipt_date, product_code, product_name_snapshot, weight_uom_snapshot,
    total_tray_quantity, total_weight_kg, item_count, created_by, created_at, metadata
  ) values (
    v_document_no, v_today, 'WKB-0002-2', coalesce(nullif(trim(v_product.sku_name), ''), 'WKB-0002-2'),
    coalesce(nullif(trim(v_product.uom_name), ''), 'KG'), v_total_trays, v_total_weight,
    v_item_count, p_actor_user_id, v_now, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;
    v_lot_no := trim(v_item->>'lotNo');
    v_tray_quantity := round((v_item->>'quantity')::numeric, 3);
    v_weight_kg := round((v_item->>'weightKg')::numeric, 3);
    v_remark := nullif(trim(coalesce(v_item->>'remark', '')), '');

    insert into public.production_stock_movements (
      movement_no, movement_type, movement_date, movement_at,
      department_id, department_code, product_code, product_name_snapshot,
      category_code, lot_no, uom_name, quantity_in, weight_in_kg,
      source_document_type, source_document_no, reference_type, reference_no,
      remark, metadata, created_by
    ) values (
      public.generate_production_stock_reference_no('MVPRW'), 'receipt_in', v_today, v_now,
      v_department.id, v_department.code, 'WKB-0002-2', coalesce(nullif(trim(v_product.sku_name), ''), 'WKB-0002-2'),
      coalesce(nullif(trim(v_product.iccat_code), ''), '03'), v_lot_no,
      coalesce(nullif(trim(v_product.uom_name), ''), 'KG'), v_tray_quantity, v_weight_kg,
      'piece_rate_prison_receipt', v_document_no || '-' || lpad(v_line_no::text, 3, '0'),
      'piece_rate_prison_receipt', v_document_no, coalesce(v_remark, 'รับเข้าเนื้อขนมจากเรือนจำ'),
      jsonb_build_object(
        'receiptId', v_receipt_id, 'documentNo', v_document_no, 'lineNo', v_line_no,
        'quantityUnit', 'กระบะ', 'trayQuantity', v_tray_quantity, 'lotNo', v_lot_no,
        'source', 'prison_manual_receipt'
      ) || coalesce(p_metadata, '{}'::jsonb), p_actor_user_id
    ) returning id into v_movement_id;

    insert into public.production_piece_rate_prison_receipt_items (
      receipt_id, line_no, lot_no, tray_quantity, weight_kg, remark, stock_movement_id
    ) values (
      v_receipt_id, v_line_no, v_lot_no, v_tray_quantity, v_weight_kg, v_remark, v_movement_id
    );
  end loop;

  return jsonb_build_object(
    'id', v_receipt_id,
    'documentNo', v_document_no,
    'receiptDate', v_today,
    'productCode', 'WKB-0002-2',
    'productName', v_product.sku_name,
    'weightUnit', coalesce(nullif(trim(v_product.uom_name), ''), 'KG'),
    'totalQuantity', v_total_trays,
    'totalWeightKg', v_total_weight,
    'itemCount', v_item_count,
    'createdAt', v_now
  );
end;
$$;

revoke all on function public.create_piece_rate_prison_receipt_atomic(jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_piece_rate_prison_receipt_atomic(jsonb, uuid, jsonb) to service_role;
