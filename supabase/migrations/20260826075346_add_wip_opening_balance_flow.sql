create table if not exists public.production_wip_opening_balance_batches (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  opening_date date not null,
  item_count integer not null check (item_count > 0),
  total_quantity integer not null check (total_quantity > 0),
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_username text,
  created_at timestamptz not null default now()
);

create table if not exists public.production_wip_opening_balance_movements (
  id uuid primary key default gen_random_uuid(),
  opening_batch_id uuid not null references public.production_wip_opening_balance_batches(id) on delete restrict,
  movement_type text not null check (movement_type in ('adjustment_in', 'issue')),
  movement_date date not null,
  product_code text not null,
  product_name_snapshot text not null,
  barcode text not null,
  lot_no text not null check (lot_no ~ '^[0-9]{6}$'),
  quantity_in integer not null default 0 check (quantity_in >= 0),
  quantity_out integer not null default 0 check (quantity_out >= 0),
  operator_user_id uuid references auth.users(id) on delete set null,
  request_id text,
  movement_no text,
  notes text,
  issue_purpose text,
  recipient_note text,
  created_at timestamptz not null default now(),
  constraint production_wip_opening_movements_one_direction_check check (
    (quantity_in > 0 and quantity_out = 0) or (quantity_out > 0 and quantity_in = 0)
  )
);

create unique index if not exists production_wip_opening_movements_request_idx
  on public.production_wip_opening_balance_movements (request_id) where request_id is not null;
create unique index if not exists production_wip_opening_movements_no_idx
  on public.production_wip_opening_balance_movements (movement_no) where movement_no is not null;
create index if not exists production_wip_opening_batches_date_idx
  on public.production_wip_opening_balance_batches (opening_date desc, created_at desc);
create index if not exists production_wip_opening_movements_stock_idx
  on public.production_wip_opening_balance_movements
    (product_code, lot_no, barcode, movement_date, created_at);

alter table public.production_wip_opening_balance_batches enable row level security;
alter table public.production_wip_opening_balance_movements enable row level security;
revoke all on public.production_wip_opening_balance_batches from anon, authenticated;
revoke all on public.production_wip_opening_balance_movements from anon, authenticated;
grant select, insert on public.production_wip_opening_balance_batches to service_role;
grant select, insert on public.production_wip_opening_balance_movements to service_role;

create or replace function public.record_wip_opening_balance_batch(
  p_request_id text, p_opening_date date, p_items jsonb,
  p_actor_user_id uuid, p_actor_username text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.production_wip_opening_balance_batches;
  v_item jsonb;
  v_index integer := 0;
  v_item_count integer;
  v_total_quantity integer := 0;
  v_product_code text;
  v_product_name text;
  v_barcode text;
  v_lot_no text;
  v_quantity integer;
  v_lot_date date;
begin
  if nullif(trim(p_request_id), '') is null then raise exception 'request_id is required'; end if;
  if p_opening_date is null then raise exception 'opening_date is required'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 200 then
    raise exception 'จำนวนรายการตั้งต้นต้องอยู่ระหว่าง 1 ถึง 200 รายการ';
  end if;

  select * into v_batch from public.production_wip_opening_balance_batches
  where request_id = trim(p_request_id);
  if found then
    return jsonb_build_object(
      'batchId', v_batch.id, 'itemCount', v_batch.item_count,
      'totalQuantity', v_batch.total_quantity, 'duplicated', true
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    v_product_code := upper(trim(coalesce(v_item->>'productCode', '')));
    v_product_name := trim(coalesce(v_item->>'productName', ''));
    v_barcode := upper(trim(coalesce(v_item->>'barcode', '')));
    v_lot_no := trim(coalesce(v_item->>'lotNo', ''));
    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'จำนวนตั้งต้นรายการที่ % ไม่ถูกต้อง', v_index;
    end;
    if v_product_code = '' or v_product_name = '' or v_barcode = '' then
      raise exception 'ข้อมูล WIP รายการที่ % ไม่ครบ', v_index;
    end if;
    if v_quantity <= 0 then raise exception 'จำนวนตั้งต้นรายการที่ % ต้องมากกว่า 0', v_index; end if;
    if v_lot_no !~ '^[0-9]{6}$' then
      raise exception 'LOT รายการที่ % ต้องเป็นเลข 6 หลัก รูปแบบ DDMMYY', v_index;
    end if;
    v_lot_date := to_date(
      '20' || substr(v_lot_no, 5, 2) || substr(v_lot_no, 3, 2) || substr(v_lot_no, 1, 2),
      'YYYYMMDD'
    );
    if to_char(v_lot_date, 'DDMMYY') <> v_lot_no then
      raise exception 'LOT รายการที่ % ไม่ใช่วันที่จริงในรูปแบบ DDMMYY', v_index;
    end if;
    v_total_quantity := v_total_quantity + v_quantity;
  end loop;

  insert into public.production_wip_opening_balance_batches (
    request_id, opening_date, item_count, total_quantity, operator_user_id, operator_username
  ) values (
    trim(p_request_id), p_opening_date, v_item_count, v_total_quantity,
    p_actor_user_id, nullif(trim(p_actor_username), '')
  ) returning * into v_batch;

  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    insert into public.production_wip_opening_balance_movements (
      opening_batch_id, movement_type, movement_date, product_code,
      product_name_snapshot, barcode, lot_no, quantity_in, quantity_out,
      operator_user_id, request_id, movement_no, notes
    ) values (
      v_batch.id, 'adjustment_in', p_opening_date,
      upper(trim(v_item->>'productCode')), trim(v_item->>'productName'),
      upper(trim(v_item->>'barcode')), trim(v_item->>'lotNo'),
      (v_item->>'quantity')::integer, 0, p_actor_user_id,
      trim(p_request_id) || ':' || lpad(v_index::text, 3, '0'),
      'WIP-OPEN-' || to_char(p_opening_date, 'YYYYMMDD') || '-' ||
        upper(substr(replace(v_batch.id::text, '-', ''), 1, 8)) || '-' ||
        lpad(v_index::text, 3, '0'),
      nullif(trim(coalesce(v_item->>'notes', '')), '')
    );
  end loop;

  return jsonb_build_object(
    'batchId', v_batch.id, 'itemCount', v_item_count,
    'totalQuantity', v_total_quantity, 'duplicated', false
  );
end;
$$;

create or replace function public.issue_wip_opening_cans_atomic(
  p_request_id text, p_movement_no text, p_source_movement_id uuid,
  p_barcode text, p_lot_no text, p_quantity integer, p_issue_date date,
  p_actor_user_id uuid, p_notes text default null,
  p_issue_purpose text default 'production_use', p_recipient_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source public.production_wip_opening_balance_movements;
  v_existing public.production_wip_opening_balance_movements;
  v_movement public.production_wip_opening_balance_movements;
  v_available integer;
  v_scope text;
begin
  if nullif(trim(p_request_id), '') is null then raise exception 'request_id is required'; end if;
  if nullif(trim(p_movement_no), '') is null then raise exception 'movement_no is required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;

  select * into v_existing from public.production_wip_opening_balance_movements
  where request_id = trim(p_request_id);
  if found then
    return jsonb_build_object(
      'movementId', v_existing.id, 'movementNo', v_existing.movement_no,
      'remainingQty', null, 'duplicated', true
    );
  end if;

  select * into v_source from public.production_wip_opening_balance_movements
  where id = p_source_movement_id and movement_type = 'adjustment_in' and quantity_in > 0;
  if not found then raise exception 'ไม่พบยอดตั้งต้น WIP ต้นทาง'; end if;
  if upper(trim(v_source.barcode)) <> upper(trim(p_barcode))
    or trim(v_source.lot_no) <> trim(p_lot_no) then
    raise exception 'บาร์โค้ดหรือ LOT ไม่ตรงกับยอดตั้งต้น WIP';
  end if;

  v_scope := upper(trim(v_source.product_code)) || '|' || upper(trim(p_barcode)) || '|' || trim(p_lot_no);
  perform pg_advisory_xact_lock(hashtextextended(v_scope, 0));
  select coalesce(sum(quantity_in - quantity_out), 0)::integer into v_available
  from public.production_wip_opening_balance_movements
  where upper(trim(product_code)) = upper(trim(v_source.product_code))
    and upper(trim(barcode)) = upper(trim(p_barcode))
    and trim(lot_no) = trim(p_lot_no);
  if v_available < p_quantity then raise exception 'WIP คงเหลือไม่พอ (คงเหลือ % ปี๊บ)', v_available; end if;

  insert into public.production_wip_opening_balance_movements (
    opening_batch_id, movement_type, movement_date, product_code,
    product_name_snapshot, barcode, lot_no, quantity_in, quantity_out,
    operator_user_id, request_id, movement_no, notes, issue_purpose, recipient_note
  ) values (
    v_source.opening_batch_id, 'issue', p_issue_date, v_source.product_code,
    v_source.product_name_snapshot, upper(trim(p_barcode)), trim(p_lot_no),
    0, p_quantity, p_actor_user_id, trim(p_request_id), trim(p_movement_no),
    nullif(trim(p_notes), ''),
    coalesce(nullif(trim(p_issue_purpose), ''), 'production_use'),
    nullif(trim(p_recipient_note), '')
  ) returning * into v_movement;

  return jsonb_build_object(
    'movementId', v_movement.id, 'movementNo', v_movement.movement_no,
    'remainingQty', v_available - p_quantity, 'duplicated', false
  );
end;
$$;

revoke all on function public.record_wip_opening_balance_batch(text,date,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.record_wip_opening_balance_batch(text,date,jsonb,uuid,text)
  to service_role;
revoke all on function public.issue_wip_opening_cans_atomic(text,text,uuid,text,text,integer,date,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.issue_wip_opening_cans_atomic(text,text,uuid,text,text,integer,date,uuid,text,text,text)
  to service_role;

comment on table public.production_wip_opening_balance_batches is
  'Atomic headers for manual WIP opening balances; no FG destination is required.';
comment on table public.production_wip_opening_balance_movements is
  'Independent WIP opening ledger merged with normal WIP stock by the application service.';
