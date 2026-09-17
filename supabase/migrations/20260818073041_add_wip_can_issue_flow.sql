alter table public.production_wip_can_movements
  add column if not exists request_id text,
  add column if not exists movement_no text,
  add column if not exists notes text;

create unique index if not exists production_wip_can_movements_request_unique_idx
  on public.production_wip_can_movements (request_id)
  where request_id is not null;

create unique index if not exists production_wip_can_movements_no_unique_idx
  on public.production_wip_can_movements (movement_no)
  where movement_no is not null;

create or replace function public.issue_wip_cans_atomic(
  p_request_id text,
  p_movement_no text,
  p_source_document_id uuid,
  p_barcode text,
  p_lot_no text,
  p_quantity integer,
  p_issue_date date,
  p_actor_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.production_fg_wip_documents;
  v_existing public.production_wip_can_movements;
  v_available integer;
  v_movement public.production_wip_can_movements;
  v_scope text;
begin
  if nullif(trim(p_request_id), '') is null then raise exception 'request_id is required'; end if;
  if nullif(trim(p_movement_no), '') is null then raise exception 'movement_no is required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'quantity must be positive'; end if;

  select * into v_existing
  from public.production_wip_can_movements
  where request_id = trim(p_request_id);
  if found then
    return jsonb_build_object(
      'movementId', v_existing.id,
      'movementNo', v_existing.movement_no,
      'remainingQty', null,
      'duplicated', true
    );
  end if;

  select * into v_document
  from public.production_fg_wip_documents
  where id = p_source_document_id;
  if not found then raise exception 'ไม่พบเอกสารรับเข้า WIP ต้นทาง'; end if;

  if upper(trim(v_document.wip_barcode_snapshot)) <> upper(trim(p_barcode))
    or trim(v_document.lot_no) <> trim(p_lot_no) then
    raise exception 'บาร์โค้ดหรือ LOT ไม่ตรงกับเอกสารรับเข้า WIP';
  end if;

  v_scope := upper(trim(v_document.wip_product_code)) || '|' || upper(trim(p_barcode)) || '|' || trim(p_lot_no);
  perform pg_advisory_xact_lock(hashtextextended(v_scope, 0));

  select coalesce(sum(quantity_in - quantity_out), 0)::integer into v_available
  from public.production_wip_can_movements
  where upper(trim(product_code)) = upper(trim(v_document.wip_product_code))
    and upper(trim(barcode)) = upper(trim(p_barcode))
    and trim(lot_no) = trim(p_lot_no);

  if v_available < p_quantity then
    raise exception 'WIP คงเหลือไม่พอ (คงเหลือ % ปี๊บ)', v_available;
  end if;

  insert into public.production_wip_can_movements (
    document_id, movement_type, movement_date, product_code, product_name_snapshot,
    barcode, lot_no, quantity_out, operator_user_id, request_id, movement_no, notes
  ) values (
    v_document.id, 'issue', p_issue_date, v_document.wip_product_code,
    v_document.wip_product_name_snapshot, upper(trim(p_barcode)), trim(p_lot_no),
    p_quantity, p_actor_user_id, trim(p_request_id), trim(p_movement_no), nullif(trim(p_notes), '')
  ) returning * into v_movement;

  return jsonb_build_object(
    'movementId', v_movement.id,
    'movementNo', v_movement.movement_no,
    'remainingQty', v_available - p_quantity,
    'duplicated', false
  );
end;
$$;

revoke all on function public.issue_wip_cans_atomic(text,text,uuid,text,text,integer,date,uuid,text)
  from public, anon, authenticated;
grant execute on function public.issue_wip_cans_atomic(text,text,uuid,text,text,integer,date,uuid,text)
  to service_role;
