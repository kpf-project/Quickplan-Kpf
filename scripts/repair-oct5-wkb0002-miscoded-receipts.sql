\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('repair-oct5-wkb0002-miscoded-receipts', 0));

create temp table correction_scope (
  barcode text primary key,
  from_product_code text not null,
  from_lot_no text not null,
  to_lot_no text not null,
  expected_weight_kg numeric(12,3) not null
) on commit drop;

insert into correction_scope values
  ('01102600220001', 'WKB-0002-2', '0110260002-1', '0110260002-1', 12.790),
  ('01102600220002', 'WKB-0002-2', '0110260002-1', '0110260002-1', 12.750),
  ('01102600220003', 'WKB-0002-2', '0110260002-1', '0110260002-1', 13.360),
  ('03102600690062', 'WKB-0069',   '0310260069-1', '0310260002-1', 12.040),
  ('03102600690063', 'WKB-0069',   '0310260069-1', '0310260002-1', 12.160),
  ('03102600690064', 'WKB-0069',   '0310260069-1', '0310260002-1', 12.180),
  ('03102600690065', 'WKB-0069',   '0310260069-1', '0310260002-1', 12.090),
  ('03102600690066', 'WKB-0069',   '0310260069-1', '0310260002-1', 12.140);

create temp table before_receipts on commit drop as
select r.*, p.sku_code as source_product_code, l.lot_code as source_lot_code
from public.production_weight_receipts r
join correction_scope s on s.barcode = r.barcode
join public.production_weight_scale_products p on p.id = r.product_config_id
join public.production_weight_scale_lots l on l.id = r.lot_id
for update of r;

create temp table before_issue_items on commit drop as
select i.*
from public.production_stock_issue_items i
join before_receipts r on r.id = i.source_receipt_id
for update;

create temp table before_movements on commit drop as
select m.*
from public.production_stock_movements m
where m.metadata ->> 'sourceReceiptId' in (select id::text from before_receipts)
for update;

create temp table target_product on commit drop as
select p.id as product_config_id,p.department_id,pc.sku_code,pc.sku_name,
       pc.iccat_code,pc.uom_name
from public.production_weight_scale_products p
join public.products_cache pc on pc.sku_code = p.sku_code
where p.sku_code = 'WKB-0002'
  and p.department_id = '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'
for update of p;

do $$
begin
  if (select count(*) from before_receipts) <> 8
     or (select count(*) from before_issue_items) <> 15
     or (select count(*) from before_movements) <> 30
     or (select count(*) from target_product) <> 1 then
    raise exception 'Correction scope mismatch: receipts %, issue items %, movements %, target products %',
      (select count(*) from before_receipts),
      (select count(*) from before_issue_items),
      (select count(*) from before_movements),
      (select count(*) from target_product);
  end if;

  if exists (
    select 1
    from before_receipts r
    join correction_scope s on s.barcode = r.barcode
    where r.source_product_code <> s.from_product_code
       or r.source_lot_code <> s.from_lot_no
       or r.net_weight_kg <> s.expected_weight_kg
       or r.status <> 'recorded'
  ) then
    raise exception 'Receipt identity, LOT, weight, or status precondition failed';
  end if;

  if round((select sum(net_weight_kg) from before_receipts where source_product_code = 'WKB-0002-2')::numeric, 3) <> 38.900
     or round((select sum(net_weight_kg) from before_receipts where source_product_code = 'WKB-0069')::numeric, 3) <> 60.610 then
    raise exception 'Receipt group totals changed';
  end if;

  if (select count(*) from before_issue_items where status = 'confirmed') <> 8
     or (select count(*) from before_issue_items where status = 'voided') <> 7
     or round((select sum(weight_kg) from before_issue_items where status = 'confirmed')::numeric, 3) <> 99.510
     or exists (
       select 1 from before_issue_items i
       join correction_scope s on s.barcode = i.barcode
       where i.product_code <> s.from_product_code
          or i.lot_no <> s.from_lot_no
          or i.weight_kg <> s.expected_weight_kg
          or i.quantity <> 1
          or i.status not in ('confirmed','voided')
     ) then
    raise exception 'Issue history precondition failed';
  end if;

  if (select count(*) from before_movements where movement_type = 'receipt_in') <> 8
     or (select count(*) from before_movements where movement_type = 'issue_out') <> 15
     or (select count(*) from before_movements where movement_type = 'adjustment_in') <> 7
     or exists (
       select 1 from before_movements m
       join before_receipts r on r.id::text = m.metadata ->> 'sourceReceiptId'
       join correction_scope s on s.barcode = r.barcode
       where m.product_code <> s.from_product_code
          or m.lot_no <> s.from_lot_no
          or m.movement_type not in ('receipt_in','issue_out','adjustment_in')
     )
     or round((select sum(weight_in_kg) from before_movements)::numeric, 3)
        <> round((select sum(weight_out_kg) from before_movements)::numeric, 3) then
    raise exception 'Movement history precondition failed';
  end if;

  if exists (
    select 1 from public.production_erp_export_lines e
    where e.source_receipt_id in (select id from before_receipts)
  ) or exists (
    select 1 from public.production_weight_receipts r
    where r.metadata ->> 'sourceReceiptId' in (select id::text from before_receipts)
  ) or exists (
    select 1 from public.production_prison_issue_items i
    where i.source_receipt_id in (select id from before_receipts)
  ) then
    raise exception 'ERP export, return receipt, or separate prison chain exists';
  end if;
end;
$$;

create temp table before_target_lots on commit drop as
select l.*
from public.production_weight_scale_lots l
join target_product p on p.product_config_id = l.product_config_id
where l.lot_code in ('0110260002-1','0310260002-1');

insert into public.production_weight_scale_lots (
  product_config_id,lot_code,status,opened_at,closed_at
)
select p.product_config_id,'0310260002-1','closed',
       min(r.weighed_at),max(r.weighed_at)
from target_product p
cross join before_receipts r
where r.source_product_code = 'WKB-0069'
  and not exists (
    select 1 from public.production_weight_scale_lots l
    where l.product_config_id = p.product_config_id
      and l.lot_code = '0310260002-1'
  )
group by p.product_config_id;

create temp table correction_targets on commit drop as
select s.barcode,s.from_product_code,s.from_lot_no,s.to_lot_no,s.expected_weight_kg,
       p.product_config_id,p.sku_code,p.sku_name,p.iccat_code,p.uom_name,l.id as lot_id
from correction_scope s
cross join target_product p
join public.production_weight_scale_lots l
  on l.product_config_id = p.product_config_id and l.lot_code = s.to_lot_no;

do $$
begin
  if (select count(*) from correction_targets) <> 8 then
    raise exception 'Unable to resolve all corrected product LOTs';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('receipts',(select jsonb_agg(to_jsonb(r) order by r.barcode) from before_receipts r),'issueItems',(select jsonb_agg(to_jsonb(i) order by i.barcode,i.created_at) from before_issue_items i),'movements',(select jsonb_agg(to_jsonb(m) order by m.movement_at,m.id) from before_movements m),'existingTargetLots',(select jsonb_agg(to_jsonb(l) order by l.lot_code) from before_target_lots l),'scope',(select jsonb_agg(to_jsonb(s) order by s.barcode) from correction_scope s))) to '.backups/oct5-wkb0002-product-correction-before.json'
\endif

update public.production_weight_receipts r
set product_config_id = t.product_config_id,
    lot_id = t.lot_id,
    metadata = coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
      'productCode',t.sku_code,
      'productName',t.sku_name,
      'lotNo',t.to_lot_no,
      'historicalProductCorrection',jsonb_build_object(
        'fromProductCode',t.from_product_code,
        'toProductCode',t.sku_code,
        'fromLotNo',t.from_lot_no,
        'toLotNo',t.to_lot_no,
        'originalBarcode',r.barcode,
        'barcodeChanged',false,
        'reason','ผู้ใช้งานยืนยันว่าเลือกสินค้า WIP ผิดตอนชั่งเข้า',
        'correctedAt',now()
      )
    )
from correction_targets t
where r.barcode = t.barcode;

update public.production_stock_issue_items i
set product_code = t.sku_code,
    product_name_snapshot = t.sku_name,
    category_code = t.iccat_code,
    lot_no = t.to_lot_no,
    uom_name = t.uom_name,
    metadata = coalesce(i.metadata,'{}'::jsonb) || jsonb_build_object(
      'historicalProductCorrection',jsonb_build_object(
        'fromProductCode',t.from_product_code,
        'toProductCode',t.sku_code,
        'fromLotNo',t.from_lot_no,
        'toLotNo',t.to_lot_no,
        'originalBarcode',i.barcode,
        'barcodeChanged',false,
        'reason','แก้ตามรายการชั่งเข้าต้นทาง',
        'correctedAt',now()
      )
    )
from correction_targets t
where i.source_receipt_id = (select r.id from before_receipts r where r.barcode = t.barcode);

update public.production_stock_movements m
set product_code = t.sku_code,
    product_name_snapshot = t.sku_name,
    category_code = t.iccat_code,
    lot_no = t.to_lot_no,
    uom_name = t.uom_name,
    metadata = coalesce(m.metadata,'{}'::jsonb) || jsonb_build_object(
      'historicalProductCorrection',jsonb_build_object(
        'fromProductCode',t.from_product_code,
        'toProductCode',t.sku_code,
        'fromLotNo',t.from_lot_no,
        'toLotNo',t.to_lot_no,
        'originalBarcode',t.barcode,
        'barcodeChanged',false,
        'reason','แก้ตามรายการชั่งเข้าต้นทาง',
        'correctedAt',now()
      )
    )
from correction_targets t
join before_receipts r on r.barcode = t.barcode
where m.metadata ->> 'sourceReceiptId' = r.id::text;

do $$
begin
  if exists (
    select 1 from before_receipts b
    join public.production_weight_receipts r on r.id = b.id
    join correction_targets t on t.barcode = b.barcode
    join public.production_weight_scale_products p on p.id = r.product_config_id
    join public.production_weight_scale_lots l on l.id = r.lot_id
    where p.sku_code <> 'WKB-0002'
       or l.lot_code <> t.to_lot_no
       or r.barcode <> b.barcode
       or r.net_weight_kg <> b.net_weight_kg
       or r.gross_weight_kg <> b.gross_weight_kg
       or r.tare_weight_kg <> b.tare_weight_kg
       or r.weighed_at <> b.weighed_at
       or r.status <> b.status
  ) then
    raise exception 'Receipt verification failed';
  end if;

  if exists (
    select 1 from before_issue_items b
    join public.production_stock_issue_items i on i.id = b.id
    join correction_targets t on t.barcode = b.barcode
    where i.product_code <> 'WKB-0002'
       or i.product_name_snapshot <> t.sku_name
       or i.lot_no <> t.to_lot_no
       or i.barcode <> b.barcode
       or i.quantity <> b.quantity
       or i.weight_kg <> b.weight_kg
       or i.status <> b.status
       or i.issued_at <> b.issued_at
  ) then
    raise exception 'Issue history verification failed';
  end if;

  if exists (
    select 1 from before_movements b
    join public.production_stock_movements m on m.id = b.id
    join before_receipts r on r.id::text = b.metadata ->> 'sourceReceiptId'
    join correction_targets t on t.barcode = r.barcode
    where m.product_code <> 'WKB-0002'
       or m.product_name_snapshot <> t.sku_name
       or m.lot_no <> t.to_lot_no
       or m.movement_type <> b.movement_type
       or m.movement_date <> b.movement_date
       or m.quantity_in <> b.quantity_in
       or m.quantity_out <> b.quantity_out
       or m.weight_in_kg <> b.weight_in_kg
       or m.weight_out_kg <> b.weight_out_kg
       or m.source_document_no is distinct from b.source_document_no
  ) then
    raise exception 'Movement history verification failed';
  end if;

  if (select count(*) from public.production_stock_issue_report_lines_v v
      where v.issue_date = date '2026-10-05'
        and v.document_status = 'confirmed' and v.item_status = 'confirmed'
        and v.barcode in (select barcode from correction_scope)
        and v.product_code = 'WKB-0002') <> 8
     or exists (
       select 1 from public.production_stock_issue_report_lines_v v
       where v.issue_date = date '2026-10-05'
         and v.document_status = 'confirmed' and v.item_status = 'confirmed'
         and v.barcode in (select barcode from correction_scope)
         and v.product_code <> 'WKB-0002'
     ) then
    raise exception 'Report verification failed';
  end if;
end;
$$;

select product_code,lot_no,count(*) as quantity,round(sum(weight_kg)::numeric,3) as weight_kg
from public.production_stock_issue_report_lines_v
where issue_date = date '2026-10-05'
  and document_status = 'confirmed'
  and item_status = 'confirmed'
  and destination_room_code = 'BISCUIT_PACKING'
group by product_code,lot_no
having product_code in ('WKB-0002','WKB-0002-2','WKB-0069')
order by product_code,lot_no;

\if :APPLY
commit;
\else
rollback;
\endif
