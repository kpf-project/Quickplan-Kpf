-- Keep stock mutations behind server APIs and make receipt cancellation atomic.
revoke all on function public.cancel_production_stock_issue_item(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_production_stock_issue_item(uuid, uuid, text)
  to service_role;

revoke all on function public.create_production_stock_return(text, numeric, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_production_stock_return(text, numeric, uuid, text)
  to service_role;

revoke all on function public.sync_production_weight_receipt_stock_movement()
  from public, anon, authenticated;

create or replace function public.cancel_production_weight_receipt(
  p_receipt_id uuid,
  p_actor_user_id uuid default null,
  p_void_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.production_weight_receipts%rowtype;
  v_void_reason text := nullif(trim(coalesce(p_void_reason, '')), '');
begin
  if p_receipt_id is null then
    raise exception using errcode = 'P0001', message = 'ไม่พบรายการชั่งที่ต้องการยกเลิก';
  end if;

  select * into v_receipt
  from public.production_weight_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบรายการชั่งที่ต้องการยกเลิก';
  end if;

  if lower(coalesce(v_receipt.metadata ->> 'isReturn', 'false')) = 'true' then
    raise exception using errcode = 'P0001', message = 'รายการนี้เป็นรายการชั่งคืน กรุณายกเลิกผ่านหน้าชั่งคืน';
  end if;

  if v_receipt.status <> 'recorded' then
    raise exception using errcode = 'P0001', message = 'รายการชั่งนี้ถูกยกเลิกไปแล้ว';
  end if;

  if exists (
    select 1
    from public.production_stock_issue_items i
    join public.production_stock_issue_documents d on d.id = i.issue_document_id
    where i.source_receipt_id = p_receipt_id
      and i.status = 'confirmed'
      and d.status = 'confirmed'
  ) then
    raise exception using errcode = 'P0001', message = 'รายการนี้ถูกเบิกไปแล้ว ไม่สามารถยกเลิกชั่งได้';
  end if;

  update public.production_weight_receipts
  set status = 'voided',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'receiptStatus', 'voided',
        'voidedAt', timezone('utc', now()),
        'voidedBy', p_actor_user_id,
        'voidReason', v_void_reason
      ))
  where id = p_receipt_id
  returning * into v_receipt;

  return to_jsonb(v_receipt);
end;
$$;

revoke all on function public.cancel_production_weight_receipt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_production_weight_receipt(uuid, uuid, text)
  to service_role;

-- Serialize return-label allocation by root receipt so reissued returns cannot reuse X01.
create or replace function public.next_production_stock_return_barcode(
  p_source_receipt_id uuid
)
returns table (return_barcode text, return_sequence integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.production_weight_receipts%rowtype;
  v_root_id uuid;
  v_root_barcode text;
begin
  select * into v_source
  from public.production_weight_receipts
  where id = p_source_receipt_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'ไม่พบใบชั่งต้นทางสำหรับสร้างบาร์โค้ดชั่งคืน';
  end if;

  v_root_id := case
    when lower(coalesce(v_source.metadata ->> 'isReturn', 'false')) = 'true'
      and coalesce(v_source.metadata ->> 'sourceReceiptId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (v_source.metadata ->> 'sourceReceiptId')::uuid
    else v_source.id
  end;

  perform pg_advisory_xact_lock(hashtextextended(v_root_id::text, 0));

  select upper(trim(barcode)) into v_root_barcode
  from public.production_weight_receipts
  where id = v_root_id
  for update;

  if coalesce(v_root_barcode, '') = '' then
    raise exception using errcode = 'P0001', message = 'ใบชั่งต้นทางไม่มีบาร์โค้ด';
  end if;

  select count(*)::integer + 1 into return_sequence
  from public.production_weight_receipts
  where lower(coalesce(metadata ->> 'isReturn', 'false')) = 'true'
    and metadata ->> 'sourceReceiptId' = v_root_id::text;

  return_barcode := v_root_barcode || 'X' || lpad(return_sequence::text, 2, '0');
  return next;
end;
$$;

revoke all on function public.next_production_stock_return_barcode(uuid)
  from public, anon, authenticated;

do $$
declare
  v_signature regprocedure := 'public.create_production_stock_return(text,numeric,numeric,text,uuid,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_old text := E'v_return_sequence := v_issue.return_count + 1;\n  v_return_barcode := v_source_barcode || ''X'' || lpad(v_return_sequence::text, 2, ''0'');';
  v_new text := E'select generated.return_barcode, generated.return_sequence\n  into v_return_barcode, v_return_sequence\n  from public.next_production_stock_return_barcode(v_issue.source_receipt_id) generated;';
begin
  if strpos(v_definition, v_old) = 0 then
    raise exception 'create_production_stock_return definition changed; return barcode patch was not applied';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$$;

-- Repair the one known duplicate as a complete linked history before restoring uniqueness.
do $$
declare
  v_old_barcode constant text := '02072600020350X01';
  v_new_barcode constant text := '02072600020350X02';
  v_receipt_id constant uuid := 'b4faa2be-05dd-4b93-a602-ce57a9e5cd34';
  v_count integer;
begin
  select count(*) into v_count
  from public.production_weight_receipts
  where barcode = v_old_barcode;
  if v_count <> 2 then
    raise exception 'Expected exactly two receipts with barcode %, found %', v_old_barcode, v_count;
  end if;

  if exists (select 1 from public.production_weight_receipts where barcode = v_new_barcode) then
    raise exception 'Replacement barcode % already exists', v_new_barcode;
  end if;

  if not exists (
    select 1 from public.production_weight_receipts
    where id = v_receipt_id
      and barcode = v_old_barcode
      and net_weight_kg = 4.860
      and metadata ->> 'sourceIssueItemId' = '3b49aa06-6a17-4f4a-86fd-b3e5e7e10436'
  ) then
    raise exception 'Duplicate receipt precondition failed; no data changed';
  end if;

  update public.production_weight_receipts
  set barcode = v_new_barcode,
      metadata = jsonb_set(metadata, '{returnSequence}', '2'::jsonb, true)
  where id = v_receipt_id;

  update public.production_stock_movements
  set source_document_no = v_new_barcode,
      reference_no = v_new_barcode,
      metadata = jsonb_set(metadata, '{returnSequence}', '2'::jsonb, true)
  where movement_type = 'return_in'
    and metadata ->> 'returnReceiptId' = v_receipt_id::text;

  update public.production_stock_issue_items
  set barcode = v_new_barcode
  where source_receipt_id = v_receipt_id;

  update public.production_stock_issue_documents d
  set metadata = jsonb_set(d.metadata, '{barcode}', to_jsonb(v_new_barcode), true)
  where exists (
    select 1 from public.production_stock_issue_items i
    where i.issue_document_id = d.id and i.source_receipt_id = v_receipt_id
  );

  update public.production_stock_movements
  set reference_no = v_new_barcode,
      metadata = jsonb_set(metadata, '{barcode}', to_jsonb(v_new_barcode), true)
  where movement_type = 'issue_out'
    and metadata ->> 'sourceReceiptId' = v_receipt_id::text;
end;
$$;

create unique index production_weight_receipts_barcode_uidx
  on public.production_weight_receipts (barcode)
  where barcode is not null;

notify pgrst, 'reload schema';
