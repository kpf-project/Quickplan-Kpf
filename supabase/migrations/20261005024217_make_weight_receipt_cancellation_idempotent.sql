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

  if v_receipt.status = 'voided' then
    return to_jsonb(v_receipt) || jsonb_build_object('alreadyCancelled', true);
  end if;

  if v_receipt.status <> 'recorded' then
    raise exception using errcode = 'P0001', message = 'สถานะรายการชั่งไม่พร้อมยกเลิก';
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

  return to_jsonb(v_receipt) || jsonb_build_object('alreadyCancelled', false);
end;
$$;

revoke all on function public.cancel_production_weight_receipt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_production_weight_receipt(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
