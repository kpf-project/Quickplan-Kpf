create or replace function public.prevent_return_receipt_stock_issue()
returns trigger
language plpgsql
as $$
declare
  v_is_return boolean := false;
begin
  select lower(coalesce(receipts.metadata ->> 'isReturn', 'false')) in ('true', '1', 'yes')
  into v_is_return
  from public.production_weight_receipts receipts
  where receipts.id = new.source_receipt_id;

  if v_is_return then
    raise exception using
      errcode = 'P0001',
      message = 'ไม่สามารถเบิกจากรายการชั่งคืนได้ กรุณาเบิกจากบาร์โค้ดรับเข้าเดิม';
  end if;

  return new;
end;
$$;

drop trigger if exists production_stock_issue_items_prevent_return_receipt
  on public.production_stock_issue_items;
create trigger production_stock_issue_items_prevent_return_receipt
  before insert or update of source_receipt_id
  on public.production_stock_issue_items
  for each row execute function public.prevent_return_receipt_stock_issue();
