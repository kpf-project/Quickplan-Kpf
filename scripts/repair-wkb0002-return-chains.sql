-- Repair two historical WKB-0002 return chains whose source issues were cancelled after returns existed.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply once to commit.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create temp table source_items as
select * from public.production_stock_issue_items
where id in ('ccd2f129-3c4a-4eab-a6dd-588c86d54863','7ab4b280-d4cc-4bfc-b0fa-0d6dd6f004c6');
create temp table duplicate_items as
select * from public.production_stock_issue_items
where id in ('e9e506b8-f479-4156-b473-376774578ef9','d41795a4-9967-4936-9ee0-767ee04b3996');
create temp table return_issue_items as
select * from public.production_stock_issue_items
where id in ('60a9f637-964e-4a70-95fa-0680d55c4c03','85ee4c50-7f1b-45b3-9c61-e03a2f065fc6','3e4c5640-b194-4505-990a-b8131d9dc5c9');
create temp table affected_documents as
select d.* from public.production_stock_issue_documents d
where d.id in (
  select issue_document_id from source_items
  union select issue_document_id from duplicate_items
  union select issue_document_id from return_issue_items
);
create temp table source_adjustments as
select * from public.production_stock_movements
where id in ('6b68c2ad-41f3-4590-990a-b36e3b528836','00c20d2f-9094-408b-a8c1-1c99b599020e');
create temp table chain_movements as
select * from public.production_stock_movements m
where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
  and (m.metadata->>'sourceBarcode' in ('19082600020017','19082600020020')
       or m.metadata->>'returnBarcode' in ('19082600020017X01','19082600020020X01')
       or m.metadata->>'barcode' in ('19082600020017','19082600020017X01','19082600020020','19082600020020X01'));
create temp table chain_receipts as
select * from public.production_weight_receipts
where id in (
  'd44a97b0-2424-4952-ac7d-09157f17404b','7889f7e5-59d6-47cb-b3d7-87b6162392f2',
  '35576b4f-c78d-4f70-8d30-02aeea4c30d4','597babe5-9a67-41c5-aa1a-ca0f7d25ee76'
);

select i.id from public.production_stock_issue_items i
where i.id in (select id from source_items union select id from duplicate_items union select id from return_issue_items)
for update;
select d.id from public.production_stock_issue_documents d where d.id in (select id from affected_documents) for update;
select m.id from public.production_stock_movements m where m.id in (select id from chain_movements) for update;
select r.id from public.production_weight_receipts r where r.id in (select id from chain_receipts) for update;

do $$ begin
  if (select count(*) from source_items)<>2 or (select count(*) from duplicate_items)<>2
     or (select count(*) from return_issue_items)<>3 or (select count(*) from affected_documents)<>7
     or (select count(*) from source_adjustments)<>2 or (select count(*) from chain_receipts)<>4 then
    raise exception 'Expected exact WKB-0002 chain row counts';
  end if;
  if exists(select 1 from source_items where status<>'voided' or product_code<>'WKB-0002'
            or lot_no<>'1908260002-1' or barcode not in ('19082600020017','19082600020020')
            or weight_kg not in (13.660,13.440)) then
    raise exception 'Source issue precondition failed';
  end if;
  if exists(select 1 from duplicate_items where status<>'confirmed' or product_code<>'WKB-0002'
            or lot_no<>'1908260002-1' or barcode not in ('19082600020017','19082600020020')
            or weight_kg not in (13.660,13.440)) then
    raise exception 'Duplicate issue precondition failed';
  end if;
  if (select count(*) from source_items s join duplicate_items d using(source_receipt_id)
      where s.barcode=d.barcode and s.weight_kg=d.weight_kg)<>2 then
    raise exception 'Source/duplicate pairing failed';
  end if;
  if exists(select 1 from affected_documents d where
            (select count(*) from public.production_stock_issue_items i where i.issue_document_id=d.id)<>1) then
    raise exception 'Affected document has unexpected extra items';
  end if;
  if exists(select 1 from source_items s join affected_documents d on d.id=s.issue_document_id
            where d.status<>'voided' or d.issue_date not in ('2026-08-21','2026-08-22')) then
    raise exception 'Source document precondition failed';
  end if;
  if exists(select 1 from duplicate_items i join affected_documents d on d.id=i.issue_document_id
            where d.status<>'confirmed' or d.issue_date<>'2026-09-01') then
    raise exception 'Duplicate document precondition failed';
  end if;
  if not exists(select 1 from return_issue_items where id='60a9f637-964e-4a70-95fa-0680d55c4c03' and status='voided' and weight_kg=2.950)
     or (select count(*) from return_issue_items where id in ('85ee4c50-7f1b-45b3-9c61-e03a2f065fc6','3e4c5640-b194-4505-990a-b8131d9dc5c9') and status='confirmed')<>2 then
    raise exception 'Return issue history precondition failed';
  end if;
  if exists(select 1 from chain_receipts where status<>'recorded')
     or not exists(select 1 from chain_receipts where barcode='19082600020017X01' and net_weight_kg=8.280 and metadata->>'sourceIssueItemId'='ccd2f129-3c4a-4eab-a6dd-588c86d54863')
     or not exists(select 1 from chain_receipts where barcode='19082600020020X01' and net_weight_kg=2.950 and metadata->>'sourceIssueItemId'='7ab4b280-d4cc-4bfc-b0fa-0d6dd6f004c6') then
    raise exception 'Return receipt precondition failed';
  end if;
  if exists(select 1 from source_adjustments where movement_type<>'adjustment_in'
            or metadata->>'reversedMovementType'<>'issue_out') then
    raise exception 'Source adjustment precondition failed';
  end if;
  if exists(select 1 from public.production_stock_movements m
            where m.metadata->>'sourceIssueItemId' in ('e9e506b8-f479-4156-b473-376774578ef9','d41795a4-9967-4936-9ee0-767ee04b3996')
              and m.movement_type in ('return_in','waste_out')) then
    raise exception 'Duplicate root issue unexpectedly has child movements';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('sourceItems',(select jsonb_agg(to_jsonb(x)) from source_items x),'duplicateItems',(select jsonb_agg(to_jsonb(x)) from duplicate_items x),'returnIssueItems',(select jsonb_agg(to_jsonb(x)) from return_issue_items x),'documents',(select jsonb_agg(to_jsonb(x)) from affected_documents x),'movements',(select jsonb_agg(to_jsonb(x)) from chain_movements x),'receipts',(select jsonb_agg(to_jsonb(x)) from chain_receipts x))) to '.backups/wkb0002-return-chain-repair-before.json'
\endif

update public.production_stock_issue_items i
set status='voided',voided_at=now(),voided_by=null,
    void_reason='แก้ประวัติซ้ำ: บาร์โค้ดต้นทางถูกเบิกใหม่หลังยกเลิกทั้งที่มีรายการชั่งคืน',
    metadata=i.metadata || jsonb_build_object('historicalReturnChainRepair20260907',
      jsonb_build_object('action','void_duplicate_root_issue','reason','Original issue had a valid return child'))
where i.id in (select id from duplicate_items);

update public.production_stock_issue_documents d
set status='voided',voided_at=now(),voided_by=null,
    void_reason='แก้ประวัติการเบิกต้นทางซ้ำ หลังรายการเดิมมีการชั่งคืน',
    metadata=d.metadata || jsonb_build_object('historicalReturnChainRepair20260907',
      jsonb_build_object('action','void_duplicate_root_issue','reason','Reconciled WKB-0002 lot 1908260002-1'))
where d.id in (select issue_document_id from duplicate_items);

update public.production_stock_issue_items i
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
    metadata=i.metadata || jsonb_build_object('historicalReturnChainRepair20260907',
      jsonb_build_object('action','restore_source_issue','reason','Valid return child must remain attached to an active source issue'))
where i.id in (select id from source_items);

update public.production_stock_issue_documents d
set status='confirmed',voided_at=null,voided_by=null,void_reason=null,
    metadata=d.metadata || jsonb_build_object('historicalReturnChainRepair20260907',
      jsonb_build_object('action','restore_source_issue','reason','Valid return child must remain attached to an active source issue'))
where d.id in (select issue_document_id from source_items);

update public.production_stock_movements m
set metadata=m.metadata || jsonb_build_object('historicalReturnChainRepair20260907',
  jsonb_build_object(
    'effectiveReversalOfIssueItemId',(
      select d.id from duplicate_items d join source_items s using(source_receipt_id)
      where s.id=(m.metadata->>'issueItemId')::uuid
    ),
    'originalCancelledIssueItemId',m.metadata->>'issueItemId',
    'reason','Numeric reversal retained to offset duplicate root issue; original source issue restored'
  ))
where m.id in (select id from source_adjustments);

do $$ begin
  if (select count(*) from public.production_stock_issue_items where id in (select id from source_items) and status='confirmed')<>2 then
    raise exception 'Source restore verification failed';
  end if;
  if (select count(*) from public.production_stock_issue_items where id in (select id from duplicate_items) and status='voided')<>2 then
    raise exception 'Duplicate void verification failed';
  end if;
  if exists(select 1 from public.production_stock_issue_items i join return_issue_items b on b.id=i.id where to_jsonb(i)<>to_jsonb(b)) then
    raise exception 'Return issue history changed unexpectedly';
  end if;
  if exists(select 1 from public.production_weight_receipts r join chain_receipts b on b.id=r.id where to_jsonb(r)<>to_jsonb(b)) then
    raise exception 'Receipt changed unexpectedly';
  end if;
  if exists(select 1 from public.production_stock_movements m join chain_movements b on b.id=m.id
            where m.id not in (select id from source_adjustments) and to_jsonb(m)<>to_jsonb(b)) then
    raise exception 'Non-adjustment movement changed unexpectedly';
  end if;
end $$;

with dates as (
  select generate_series(date '2026-08-19',date '2026-09-04',interval '1 day')::date report_date
), opening as (
  select dates.report_date,r.balance_quantity opening_qty,r.balance_weight_kg opening_kg
  from dates cross join lateral public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',dates.report_date,now(),null,array['WKB-0002']) r
  where r.lot_no='1908260002-1'
), issues as (
  select d.issue_date report_date,sum(i.quantity) issue_qty,sum(i.weight_kg) issue_kg
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
    and i.status='confirmed' and d.status='confirmed'
    and d.issue_date between '2026-08-19' and '2026-09-04'
  group by d.issue_date
), movements as (
  select m.movement_date report_date,
    sum(case when m.movement_type='return_in' then m.quantity_in else -m.quantity_out end) movement_qty,
    sum(case when m.movement_type='return_in' then m.weight_in_kg else -m.weight_out_kg end) movement_kg
  from public.production_stock_movements m
  left join public.production_stock_issue_items i on i.id::text=nullif(m.metadata->>'sourceIssueItemId','')
  left join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where m.product_code='WKB-0002' and m.lot_no='1908260002-1'
    and m.movement_type in ('return_in','waste_out')
    and m.movement_date between '2026-08-19' and '2026-09-04'
    and (nullif(m.metadata->>'sourceIssueItemId','') is null or (i.status='confirmed' and d.status='confirmed'))
  group by m.movement_date
)
select o.report_date,o.opening_qty,round(o.opening_kg,3) opening_kg,
       coalesce(i.issue_qty,0) issue_qty,round(coalesce(i.issue_kg,0),3) issue_kg,
       coalesce(m.movement_qty,0) movement_qty,round(coalesce(m.movement_kg,0),3) movement_kg,
       o.opening_qty-coalesce(i.issue_qty,0)+coalesce(m.movement_qty,0) closing_qty,
       round(o.opening_kg-coalesce(i.issue_kg,0)+coalesce(m.movement_kg,0),3) closing_kg
from opening o left join issues i using(report_date) left join movements m using(report_date)
order by o.report_date;

\if :APPLY
commit;
\else
rollback;
\endif
