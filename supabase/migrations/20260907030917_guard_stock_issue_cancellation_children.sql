-- No historical data is changed. Fail closed for issue items with child history.
-- The item UPDATE holds a row lock; return/waste RPCs lock the same source item.
create or replace function public.guard_stock_issue_cancellation_children()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'confirmed' and new.status = 'voided' then
    if exists (
      select 1 from public.production_weight_receipts r
      where r.metadata ->> 'sourceIssueItemId' = old.id::text
    ) or exists (
      select 1 from public.production_stock_movements m
      where m.metadata ->> 'sourceIssueItemId' = old.id::text
        and m.movement_type in ('return_in', 'waste_out')
    ) then
      raise exception using errcode = 'P0001',
        message = 'ไม่สามารถยกเลิกเบิกได้: มีประวัติชั่งคืนหรือของเสียที่อ้างอิงรายการนี้ กรุณาตรวจรายการปลายทางก่อน';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_stock_issue_cancellation_children() from public, anon, authenticated;

create trigger guard_stock_issue_cancellation_children
before update of status on public.production_stock_issue_items
for each row execute function public.guard_stock_issue_cancellation_children();
