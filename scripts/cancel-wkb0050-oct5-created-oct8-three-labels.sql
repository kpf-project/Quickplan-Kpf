-- Cancel only the three confirmed WKB-0050 issues selected for Oct 5 and
-- physically submitted on Oct 8 at 16:41:41 Bangkok time.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table targets as
select i.*
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
where i.barcode in ('25092600500013', '25092600500093', '25092600500096')
  and i.product_code = 'WKB-0050'
  and i.lot_no = '2509260050-1'
  and d.issue_date = date '2026-10-05'
  and timezone('Asia/Bangkok', i.created_at)::date = date '2026-10-08';

create temp table target_documents as
select d.* from public.production_stock_issue_documents d
where d.id in (select issue_document_id from targets);

select id from public.production_stock_issue_items
where id in (select id from targets)
for update;
select id from public.production_stock_issue_documents
where id in (select id from target_documents)
for update;

do $$
begin
  if (select count(*) from targets) <> 3
     or (select count(distinct barcode) from targets) <> 3
     or (select count(*) from target_documents) <> 3 then
    raise exception 'Expected exactly three WKB-0050 issue items and documents';
  end if;

  if exists (select 1 from targets where status <> 'confirmed')
     or exists (select 1 from target_documents where status <> 'confirmed') then
    raise exception 'One or more target issues are no longer confirmed';
  end if;

  if (select round(sum(weight_kg), 3) from targets) <> 37.450 then
    raise exception 'Target weight changed; expected 37.450 kg';
  end if;

  if exists (
    select 1 from public.production_weight_receipts receipt
    where receipt.metadata ->> 'sourceIssueItemId' in (select id::text from targets)
  ) or exists (
    select 1 from public.production_stock_movements movement
    where movement.metadata ->> 'sourceIssueItemId' in (select id::text from targets)
      and movement.movement_type in ('return_in', 'waste_out')
  ) then
    raise exception 'A target issue already has return or waste history';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('items',(select jsonb_agg(to_jsonb(row)) from targets row),'documents',(select jsonb_agg(to_jsonb(row)) from target_documents row),'movements',(select jsonb_agg(to_jsonb(row)) from public.production_stock_movements row where row.source_document_no in (select issue_no from target_documents)))) to '.backups/wkb0050-oct5-created-oct8-three-labels-before-cancel.json'
\endif

select public.cancel_production_stock_issue_item(
  id,
  null::uuid,
  'ยกเลิกเบิก 3 ใบตามคำขอผู้ใช้งาน วันที่ 8 ต.ค. 2569'
)
from targets
order by barcode;

do $$
begin
  if (select count(*) from public.production_stock_issue_items
      where id in (select id from targets) and status = 'voided') <> 3
     or (select count(*) from public.production_stock_issue_documents
         where id in (select id from target_documents) and status = 'voided') <> 3 then
    raise exception 'Cancellation status verification failed';
  end if;

  if (select count(*) from public.production_stock_movements movement
      where movement.source_document_type = 'stock_issue_void'
        and movement.metadata ->> 'issueItemId' in (select id::text from targets)
        and movement.weight_in_kg > 0) <> 3 then
    raise exception 'Cancellation movement verification failed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select d.issue_no, i.barcode, i.product_code, i.lot_no, i.weight_kg,
       d.issue_date, d.status document_status, i.status item_status,
       timezone('Asia/Bangkok', i.voided_at) voided_at_bangkok,
       i.void_reason
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
where i.barcode in ('25092600500013', '25092600500093', '25092600500096')
  and d.issue_date = date '2026-10-05'
order by i.barcode;
