-- Keep stock history stable: prevent ordinary backdating, expose cancellation
-- timestamps to as-of reports, and post future issue reversals on cancellation day.

create or replace function public.production_stock_business_date(p_timestamp timestamptz)
returns date
language sql
stable
strict
parallel safe
security invoker
set search_path = public
as $$
  select case
    when timezone('Asia/Bangkok', p_timestamp)::time < time '06:01'
      then timezone('Asia/Bangkok', p_timestamp)::date - 1
    else timezone('Asia/Bangkok', p_timestamp)::date
  end;
$$;

create or replace function public.guard_production_stock_issue_date()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_historical_stock_date', true), '') <> 'on'
     and new.issue_date <> public.production_stock_business_date(new.issued_at) then
    raise exception using
      errcode = 'P0001',
      message = format(
        'วันที่เบิก %s ไม่ตรงวันผลิตปัจจุบัน %s ไม่อนุญาตให้ลงย้อนหลัง',
        new.issue_date,
        public.production_stock_business_date(new.issued_at)
      );
  end if;
  return new;
end;
$$;

drop trigger if exists production_stock_issue_documents_guard_date
  on public.production_stock_issue_documents;
create trigger production_stock_issue_documents_guard_date
  before insert or update of issue_date on public.production_stock_issue_documents
  for each row execute function public.guard_production_stock_issue_date();

create or replace view public.production_stock_issue_report_lines_v
with (security_invoker = true) as
select
  documents.id as issue_document_id,
  items.id as issue_item_id,
  documents.issue_no,
  documents.department_id,
  documents.department_code,
  documents.issue_type,
  documents.issue_date,
  documents.issued_at as document_issued_at,
  documents.status as document_status,
  documents.remark as document_remark,
  items.source_receipt_id,
  items.barcode,
  items.product_code,
  items.product_name_snapshot,
  items.category_code,
  items.lot_no,
  items.uom_name,
  items.quantity,
  items.weight_kg,
  items.issued_at,
  items.status as item_status,
  items.voided_at,
  items.void_reason,
  items.created_at,
  documents.voided_at as document_voided_at
from public.production_stock_issue_documents documents
join public.production_stock_issue_items items
  on items.issue_document_id = documents.id;

do $$
declare
  v_signature regprocedure := 'public.cancel_production_stock_issue_item(uuid,uuid,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_old_date text := 'v_issue_item.issue_date,';
  v_new_date text := 'public.production_stock_business_date(v_now),';
  v_old_metadata text := '''reversedMovementType'', ''issue_out''';
  v_new_metadata text := E'''reversedMovementType'', ''issue_out'',\n      ''originalIssueDate'', v_issue_item.issue_date,\n      ''cancellationProductionDate'', public.production_stock_business_date(v_now)';
begin
  if strpos(v_definition, 'cancellationProductionDate') > 0
     and strpos(v_definition, 'production_stock_business_date(v_now)') > 0 then
    return;
  end if;

  if strpos(v_definition, v_old_date) = 0 or strpos(v_definition, v_old_metadata) = 0 then
    raise exception 'cancel_production_stock_issue_item definition changed; history patch was not applied';
  end if;

  v_definition := replace(v_definition, v_old_date, v_new_date);
  v_definition := replace(v_definition, v_old_metadata, v_new_metadata);
  execute v_definition;
end;
$$;

revoke all on function public.production_stock_business_date(timestamptz)
  from public, anon, authenticated;
revoke all on function public.guard_production_stock_issue_date()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
