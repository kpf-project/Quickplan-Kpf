begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as select * from public.production_stock_issue_items
where id in ('ccd2f129-3c4a-4eab-a6dd-588c86d54863','7ab4b280-d4cc-4bfc-b0fa-0d6dd6f004c6');
create temp table sep1_items as select * from public.production_stock_issue_items
where id in ('e9e506b8-f479-4156-b473-376774578ef9','d41795a4-9967-4936-9ee0-767ee04b3996');
create temp table affected_documents as select * from public.production_stock_issue_documents
where id in (select issue_document_id from source_items union select issue_document_id from sep1_items);

select id from public.production_stock_issue_items
where id in (select id from source_items union select id from sep1_items) for update;
select id from public.production_stock_issue_documents
where id in (select id from affected_documents) for update;

do $$ begin
  if (select count(*) from source_items)<>2 or (select count(*) from sep1_items)<>2
     or (select count(*) from affected_documents)<>4 then raise exception 'Expected exact two chains'; end if;
  if exists(select 1 from source_items where status<>'confirmed' or restored_at is null) then
    raise exception 'Source precondition failed'; end if;
  if exists(select 1 from sep1_items where status<>'voided' or weight_kg not in (13.660,13.440)) then
    raise exception 'Sep 1 precondition failed'; end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'sep1Items',(select jsonb_agg(to_jsonb(x)) from sep1_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x))) to '.backups/wkb0002-sep1-business-date-before.json'
\endif

-- The table lock prevents concurrent writes during this legacy repair.
alter table public.production_stock_issue_items disable trigger guard_stock_issue_cancellation_children;

update public.production_stock_issue_items i
set status='voided',restored_at=null,
    voided_at=(select m.created_at from public.production_stock_movements m
      where m.metadata->>'issueItemId'=i.id::text and m.source_document_type='stock_issue_void'
      order by m.created_at limit 1),
    void_reason='ยกเลิกจากหน้ายกเลิกเบิกผลิตภัณฑ์',
    metadata=i.metadata||jsonb_build_object('businessDateCorrection20260909',
      jsonb_build_object('action','retire_cancelled_root','replacementIssueDate','2026-09-01'))
where i.id in (select id from source_items);
update public.production_stock_issue_documents d
set status='voided',restored_at=null,
    voided_at=(select i.voided_at from public.production_stock_issue_items i where i.issue_document_id=d.id),
    void_reason='ยกเลิกจากหน้ายกเลิกเบิกผลิตภัณฑ์'
where d.id in (select issue_document_id from source_items);

update public.production_stock_issue_items i
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
    metadata=i.metadata||jsonb_build_object('businessDateCorrection20260909',
      jsonb_build_object('action','activate_selected_business_date','issueDate','2026-09-01'))
where i.id in (select id from sep1_items);
update public.production_stock_issue_documents d
set status='confirmed',voided_at=null,voided_by=null,void_reason=null
where d.id in (select issue_document_id from sep1_items);

alter table public.production_stock_issue_items enable trigger guard_stock_issue_cancellation_children;

do $$ declare oq numeric; ow numeric; iq numeric; iw numeric; begin
  select balance_quantity,balance_weight_kg into oq,ow
  from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',date '2026-09-01',now(),null,array['WKB-0002']) where lot_no='1908260002-1';
  select sum(i.quantity),sum(i.weight_kg) into iq,iw
  from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1' and d.issue_date='2026-09-01'
    and i.status='confirmed' and d.status='confirmed';
  if oq<>74 or ow<>942.820 or iq<>63 or iw<>790.780 then
    raise exception 'Sep 1 verification failed: opening %/% issue %/%',oq,ow,iq,iw; end if;
end $$;

select dates.report_date,rows.balance_quantity,rows.balance_weight_kg
from (values (date '2026-09-01'),(date '2026-09-02'),(date '2026-09-03'),(date '2026-09-04')) dates(report_date)
cross join lateral public.get_production_stock_opening_as_of(
  (select id from public.production_departments where code='KP13' limit 1),
  '03',dates.report_date,now(),null,array['WKB-0002']) rows
where rows.lot_no='1908260002-1' order by dates.report_date;

\if :APPLY
commit;
\else
rollback;
\endif
