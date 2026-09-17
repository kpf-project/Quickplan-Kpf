alter table public.production_fg_wip_documents
  drop constraint if exists production_fg_wip_documents_wip_tin_qty_check;

alter table public.production_fg_wip_documents
  alter column wip_product_code drop not null,
  alter column wip_product_name_snapshot drop not null,
  alter column wip_barcode_snapshot drop not null,
  alter column wip_tin_qty set default 0;

alter table public.production_fg_wip_documents
  add constraint production_fg_wip_documents_wip_tin_qty_check
  check (wip_tin_qty >= 0);

create or replace function public.record_fg_wip_end_of_day(
  p_request_id text,
  p_document_no text,
  p_production_date date,
  p_shift_name text,
  p_lot_no text,
  p_fg_product_code text,
  p_fg_product_name text,
  p_fg_barcode text,
  p_fg_unit text,
  p_tins_per_case integer,
  p_fg_case_qty integer,
  p_wip_product_code text,
  p_wip_product_name text,
  p_wip_barcode text,
  p_wip_tin_qty integer,
  p_operator_user_id uuid,
  p_operator_username text,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.production_fg_wip_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document public.production_fg_wip_documents;
begin
  if nullif(trim(p_request_id), '') is null then raise exception 'request_id is required'; end if;
  if p_fg_case_qty <= 0 then raise exception 'fg_case_qty must be positive'; end if;
  if coalesce(p_wip_tin_qty, 0) < 0 then raise exception 'wip_tin_qty must not be negative'; end if;
  if p_tins_per_case <= 0 then raise exception 'tins_per_case must be positive'; end if;
  if coalesce(p_wip_tin_qty, 0) > 0 and nullif(trim(p_wip_barcode), '') is null then
    raise exception 'wip_barcode is required when wip_tin_qty is greater than zero';
  end if;

  select * into v_document
  from public.production_fg_wip_documents
  where request_id = p_request_id;
  if found then return v_document; end if;

  insert into public.production_fg_wip_documents (
    request_id, document_no, production_date, shift_name, lot_no,
    fg_product_code, fg_product_name_snapshot, fg_barcode_snapshot, fg_unit_snapshot,
    tins_per_case_snapshot, fg_case_qty, fg_tin_qty,
    wip_product_code, wip_product_name_snapshot, wip_barcode_snapshot, wip_tin_qty,
    operator_user_id, operator_username_snapshot, notes, metadata
  ) values (
    trim(p_request_id), trim(p_document_no), p_production_date, nullif(trim(p_shift_name), ''), trim(p_lot_no),
    trim(p_fg_product_code), trim(p_fg_product_name), nullif(trim(p_fg_barcode), ''), nullif(trim(p_fg_unit), ''),
    p_tins_per_case, p_fg_case_qty, p_fg_case_qty * p_tins_per_case,
    nullif(trim(p_wip_product_code), ''), nullif(trim(p_wip_product_name), ''), nullif(trim(p_wip_barcode), ''), coalesce(p_wip_tin_qty, 0),
    p_operator_user_id, nullif(trim(p_operator_username), ''), nullif(trim(p_notes), ''), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_document;

  if p_wip_tin_qty > 0 then
    insert into public.production_wip_can_movements (
      document_id, movement_type, movement_date, product_code, product_name_snapshot,
      barcode, lot_no, quantity_in, operator_user_id
    ) values (
      v_document.id, 'receipt', p_production_date, trim(p_wip_product_code), trim(p_wip_product_name),
      trim(p_wip_barcode), trim(p_lot_no), p_wip_tin_qty, p_operator_user_id
    );
  end if;

  return v_document;
end;
$$;

revoke all on function public.record_fg_wip_end_of_day(text,text,date,text,text,text,text,text,text,integer,integer,text,text,text,integer,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_fg_wip_end_of_day(text,text,date,text,text,text,text,text,text,integer,integer,text,text,text,integer,uuid,text,text,jsonb)
  to service_role;

-- Remove only the WIP carry-over entered on 25-26 Aug 2026 while preserving FG documents.
delete from public.production_wip_can_movements movement
using public.production_fg_wip_documents document
where movement.document_id = document.id
  and movement.movement_type = 'receipt'
  and document.production_date in (date '2026-08-25', date '2026-08-26');

update public.production_fg_wip_documents
set wip_product_code = null,
    wip_product_name_snapshot = null,
    wip_barcode_snapshot = null,
    wip_tin_qty = 0,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'wipCarryoverRemovedAt', now(),
      'wipCarryoverRemovalReason', 'User requested removal for 2026-08-25 and 2026-08-26'
    )
where production_date in (date '2026-08-25', date '2026-08-26');
