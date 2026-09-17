create table if not exists public.production_piece_rate_prison_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text not null unique,
  issue_date date not null,
  product_code text not null check (product_code = 'WKB-0002-2'),
  product_name_snapshot text not null,
  fg_product_code text not null references public.products_cache(sku_code) on delete restrict,
  fg_product_name_snapshot text not null,
  total_tray_quantity integer not null check (total_tray_quantity > 0),
  total_weight_kg numeric(14, 3) not null check (total_weight_kg > 0),
  item_count integer not null check (item_count > 0),
  issued_by uuid,
  issued_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.production_piece_rate_prison_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.production_piece_rate_prison_issues(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  lot_no text not null,
  tray_quantity integer not null check (tray_quantity > 0),
  weight_kg numeric(14, 3) not null check (weight_kg > 0),
  stock_movement_id uuid not null references public.production_stock_movements(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (issue_id, line_no)
);

create index if not exists production_piece_rate_prison_issues_date_idx
  on public.production_piece_rate_prison_issues (issue_date desc, issued_at desc);
create index if not exists production_piece_rate_prison_issue_items_issue_idx
  on public.production_piece_rate_prison_issue_items (issue_id, line_no);
create unique index if not exists production_stock_movements_prison_issue_source_uidx
  on public.production_stock_movements (source_document_type, source_document_no)
  where source_document_type = 'piece_rate_prison_issue';

alter table public.production_piece_rate_prison_issues enable row level security;
alter table public.production_piece_rate_prison_issue_items enable row level security;
revoke all on table public.production_piece_rate_prison_issues from public, anon, authenticated;
revoke all on table public.production_piece_rate_prison_issue_items from public, anon, authenticated;
grant select, insert on table public.production_piece_rate_prison_issues to service_role;
grant select, insert on table public.production_piece_rate_prison_issue_items to service_role;
grant select on table public.production_piece_rate_prison_issues to anon, authenticated;
grant select on table public.production_piece_rate_prison_issue_items to anon, authenticated;

create or replace function public.list_piece_rate_prison_issue_lots()
returns table (
  lot_no text,
  receipt_date date,
  received_at timestamptz,
  available_tray_quantity numeric,
  available_weight_kg numeric
)
language sql
security invoker
set search_path = ''
as $$
  select
    movements.lot_no,
    min(movements.movement_date) filter (where movements.quantity_in > 0) as receipt_date,
    min(movements.movement_at) filter (where movements.quantity_in > 0) as received_at,
    round(sum(movements.quantity_in - movements.quantity_out), 3) as available_tray_quantity,
    round(sum(movements.weight_in_kg - movements.weight_out_kg), 3) as available_weight_kg
  from public.production_stock_movements movements
  where movements.product_code = 'WKB-0002-2'
  group by movements.lot_no
  having round(sum(movements.quantity_in - movements.quantity_out), 3) > 0
     and round(sum(movements.weight_in_kg - movements.weight_out_kg), 3) > 0
  order by
    min(movements.movement_date) filter (where movements.quantity_in > 0),
    min(movements.movement_at) filter (where movements.quantity_in > 0),
    movements.lot_no;
$$;

create or replace function public.create_piece_rate_prison_issue_atomic(
  p_fg_product_code text,
  p_issue_date date,
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
  v_now timestamptz := timezone('utc', now());
  v_date date := coalesce(p_issue_date, (timezone('Asia/Bangkok', now()))::date);
  v_product record;
  v_fg record;
  v_department record;
  v_issue_id uuid;
  v_issue_no text;
  v_item jsonb;
  v_line integer := 0;
  v_lot text;
  v_requested integer;
  v_available_qty numeric(14, 3);
  v_available_kg numeric(14, 3);
  v_issue_kg numeric(14, 3);
  v_movement_id uuid;
  v_total_qty integer := 0;
  v_total_kg numeric(14, 3) := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'P0001', message = 'กรุณาเลือก LOT อย่างน้อย 1 รายการ';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception using errcode = 'P0001', message = 'เบิกได้ไม่เกิน 50 LOT ต่อเอกสาร';
  end if;

  select sku_code, sku_name into v_product
  from public.products_cache where upper(trim(sku_code)) = 'WKB-0002-2' limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบสินค้า WKB-0002-2';
  end if;

  select sku_code, sku_name into v_fg
  from public.products_cache
  where upper(trim(sku_code)) = upper(trim(coalesce(p_fg_product_code, '')))
  limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบสินค้า FG ปลายทาง';
  end if;

  select * into v_department from public.resolve_piece_rate_stock_department('WKB-0002-2');
  v_issue_no := public.generate_production_stock_reference_no('PRWISS');

  insert into public.production_piece_rate_prison_issues (
    issue_no, issue_date, product_code, product_name_snapshot,
    fg_product_code, fg_product_name_snapshot, total_tray_quantity,
    total_weight_kg, item_count, issued_by, issued_at, metadata
  ) values (
    v_issue_no, v_date, v_product.sku_code, coalesce(v_product.sku_name, v_product.sku_code),
    v_fg.sku_code, coalesce(v_fg.sku_name, v_fg.sku_code), 1, 1,
    jsonb_array_length(p_items), p_actor_user_id, v_now,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_issue_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line := v_line + 1;
    v_lot := trim(coalesce(v_item->>'lotNo', ''));
    if v_lot = '' then
      raise exception using errcode = 'P0001', message = 'กรุณาระบุ LOT ให้ครบ';
    end if;
    begin
      v_requested := (v_item->>'quantity')::integer;
    exception when others then
      raise exception using errcode = 'P0001', message = 'จำนวนกระบะต้องเป็นจำนวนเต็ม';
    end;
    if v_requested <= 0 then
      raise exception using errcode = 'P0001', message = 'จำนวนกระบะต้องมากกว่า 0';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('WKB-0002-2|' || v_lot, 0));
    select
      round(coalesce(sum(quantity_in - quantity_out), 0), 3),
      round(coalesce(sum(weight_in_kg - weight_out_kg), 0), 3)
    into v_available_qty, v_available_kg
    from public.production_stock_movements
    where product_code = 'WKB-0002-2' and lot_no = v_lot;

    if v_available_qty <= 0 or v_available_kg <= 0 then
      raise exception using errcode = 'P0001', message = format('LOT %s ไม่มีสต็อกคงเหลือ', v_lot);
    end if;
    if v_available_qty <> trunc(v_available_qty) then
      raise exception using errcode = 'P0001', message = format('ยอดกระบะ LOT %s ไม่เป็นจำนวนเต็ม กรุณาตรวจสอบสต็อก', v_lot);
    end if;
    if v_requested > v_available_qty then
      raise exception using errcode = 'P0001', message = format('LOT %s เหลือ %s กระบะ ไม่เพียงพอ', v_lot, v_available_qty);
    end if;

    v_issue_kg := case
      when v_requested = v_available_qty then v_available_kg
      else round((v_available_kg / v_available_qty) * v_requested, 3)
    end;

    insert into public.production_stock_movements (
      movement_no, movement_type, movement_date, movement_at,
      department_id, department_code, product_code, product_name_snapshot,
      category_code, lot_no, uom_name, quantity_out, weight_out_kg,
      source_document_type, source_document_no, reference_type, reference_no,
      remark, metadata, created_by
    ) values (
      public.generate_production_stock_reference_no('MVPRWISS'), 'issue_out', v_date, v_now,
      v_department.department_id, v_department.department_code, v_product.sku_code,
      coalesce(v_product.sku_name, v_product.sku_code), '03', v_lot, 'กระบะ',
      v_requested, v_issue_kg, 'piece_rate_prison_issue', v_issue_no || '-' || v_line,
      'fg_product', v_fg.sku_code, 'เบิกเนื้อขนมเรือนจำ',
      jsonb_build_object('prisonIssueId', v_issue_id, 'fgProductCode', v_fg.sku_code)
        || coalesce(p_metadata, '{}'::jsonb),
      p_actor_user_id
    ) returning id into v_movement_id;

    insert into public.production_piece_rate_prison_issue_items (
      issue_id, line_no, lot_no, tray_quantity, weight_kg, stock_movement_id
    ) values (v_issue_id, v_line, v_lot, v_requested, v_issue_kg, v_movement_id);

    v_total_qty := v_total_qty + v_requested;
    v_total_kg := v_total_kg + v_issue_kg;
  end loop;

  update public.production_piece_rate_prison_issues
  set total_tray_quantity = v_total_qty, total_weight_kg = round(v_total_kg, 3)
  where id = v_issue_id;

  return jsonb_build_object(
    'issueId', v_issue_id,
    'issueNo', v_issue_no,
    'totalQuantity', v_total_qty,
    'totalWeightKg', round(v_total_kg, 3)
  );
end;
$$;

revoke all on function public.list_piece_rate_prison_issue_lots() from public, anon, authenticated;
grant execute on function public.list_piece_rate_prison_issue_lots() to service_role;
revoke all on function public.create_piece_rate_prison_issue_atomic(text, date, jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_piece_rate_prison_issue_atomic(text, date, jsonb, uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
