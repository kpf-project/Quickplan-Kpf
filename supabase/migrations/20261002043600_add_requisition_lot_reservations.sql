create table if not exists public.production_requisition_lot_reservations (
  id uuid primary key default gen_random_uuid(),
  master_plan_no text not null,
  reservation_key text not null,
  document_key text not null,
  line_key text not null,
  work_date date not null,
  department_name text null,
  room_label text null,
  product_code text null,
  product_name text null,
  material_goods_code text not null,
  material_name text null,
  unit_name text null,
  parent_sku_code text not null,
  trade_code text not null,
  lot_no text not null,
  warehouse_code text not null,
  reserved_qty numeric(18, 6) not null check (reserved_qty > 0),
  reserved_base_qty numeric(18, 6) not null check (reserved_base_qty > 0),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (master_plan_no, reservation_key, trade_code, lot_no, warehouse_code)
);

create index if not exists production_requisition_lot_reservations_lookup_idx
  on public.production_requisition_lot_reservations (master_plan_no, parent_sku_code, lot_no, warehouse_code);

create index if not exists production_requisition_lot_reservations_request_idx
  on public.production_requisition_lot_reservations (master_plan_no, reservation_key);

alter table public.production_requisition_lot_reservations enable row level security;

revoke all on public.production_requisition_lot_reservations from anon;
revoke all on public.production_requisition_lot_reservations from authenticated;

create or replace function public.replace_requisition_lot_reservations(
  p_master_plan_no text,
  p_reservation_keys text[],
  p_rows jsonb,
  p_stock_by_lot jsonb,
  p_user_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  lock_key text;
begin
  for lock_key in
    select distinct key
    from (
      select concat_ws('|', parent_sku_code, lot_no, warehouse_code) as key
      from public.production_requisition_lot_reservations
      where master_plan_no = p_master_plan_no
        and reservation_key = any(coalesce(p_reservation_keys, array[]::text[]))
      union
      select concat_ws('|', parent_sku_code, lot_no, warehouse_code) as key
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as incoming(
        parent_sku_code text,
        lot_no text,
        warehouse_code text
      )
    ) keys
    order by key
  loop
    perform pg_advisory_xact_lock(hashtext(lock_key));
  end loop;

  delete from public.production_requisition_lot_reservations
  where master_plan_no = p_master_plan_no
    and reservation_key = any(coalesce(p_reservation_keys, array[]::text[]));

  if exists (
    with incoming as (
      select *
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data(
        parent_sku_code text,
        lot_no text,
        warehouse_code text,
        reserved_base_qty numeric
      )
    ),
    stock as (
      select *
      from jsonb_to_recordset(coalesce(p_stock_by_lot, '[]'::jsonb)) as stock_data(
        parent_sku_code text,
        lot_no text,
        warehouse_code text,
        available_base_qty numeric
      )
    ),
    totals as (
      select parent_sku_code, lot_no, warehouse_code, sum(reserved_base_qty) as reserved_base_qty
      from (
        select parent_sku_code, lot_no, warehouse_code, reserved_base_qty
        from public.production_requisition_lot_reservations
        where master_plan_no = p_master_plan_no
        union all
        select parent_sku_code, lot_no, warehouse_code, reserved_base_qty
        from incoming
      ) rows
      group by parent_sku_code, lot_no, warehouse_code
    )
    select 1
    from totals
    join stock using (parent_sku_code, lot_no, warehouse_code)
    where totals.reserved_base_qty > stock.available_base_qty + 0.000001
  ) then
    raise exception 'LOT ถูกจองโดยใบอื่นระหว่างบันทึก กรุณาโหลดข้อมูล LOT ใหม่แล้วเลือกอีกครั้ง'
      using errcode = 'P0001';
  end if;

  insert into public.production_requisition_lot_reservations (
    master_plan_no, reservation_key, document_key, line_key, work_date,
    department_name, room_label, product_code, product_name,
    material_goods_code, material_name, unit_name,
    parent_sku_code, trade_code, lot_no, warehouse_code,
    reserved_qty, reserved_base_qty, created_by, updated_at
  )
  select
    p_master_plan_no, reservation_key, document_key, line_key, work_date,
    department_name, room_label, product_code, product_name,
    material_goods_code, material_name, unit_name,
    parent_sku_code, trade_code, lot_no, warehouse_code,
    reserved_qty, reserved_base_qty, p_user_id, timezone('utc', now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row_data(
    reservation_key text,
    document_key text,
    line_key text,
    work_date date,
    department_name text,
    room_label text,
    product_code text,
    product_name text,
    material_goods_code text,
    material_name text,
    unit_name text,
    parent_sku_code text,
    trade_code text,
    lot_no text,
    warehouse_code text,
    reserved_qty numeric,
    reserved_base_qty numeric
  );
end;
$$;

revoke all on function public.replace_requisition_lot_reservations(text, text[], jsonb, jsonb, uuid) from public;
grant execute on function public.replace_requisition_lot_reservations(text, text[], jsonb, jsonb, uuid) to service_role;

comment on table public.production_requisition_lot_reservations is
  'Active LOT reservations for unexported production requisitions. Exported rows are removed because ERP stock becomes the source of truth.';
