\pset pager off
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('repair-wkb0002-2-selected-as-shell-20260925', 0));

create temp table correction_receipt_ids (id uuid primary key) on commit drop;
insert into correction_receipt_ids (id) values
  ('58b7ca69-8fcc-407a-aa8b-1f0722e9b233'),
  ('3a7328f4-933e-4864-a333-5c7bcd9a280d'),
  ('35886d83-27a1-4387-95fa-4c8932552be7'),
  ('17bfddd0-bc3c-4124-a0c3-81d16ea3d605'),
  ('576dfc18-e8aa-4b45-9729-769653cf37c4');

create temp table before_receipts on commit drop as
select r.*
from public.production_weight_receipts r
join correction_receipt_ids c on c.id = r.id
for update;

create temp table before_issue_items on commit drop as
select i.*
from public.production_stock_issue_items i
join correction_receipt_ids c on c.id = i.source_receipt_id
for update;

create temp table before_movements on commit drop as
select m.*
from public.production_stock_movements m
where m.metadata ->> 'sourceReceiptId' in (select id::text from correction_receipt_ids)
for update;

create temp table correction_target on commit drop as
select p.id as product_config_id,
       l.id as lot_id,
       p.department_id,
       d.code as department_code,
       pc.sku_code,
       pc.sku_name,
       pc.iccat_code,
       pc.uom_name,
       l.lot_code
from public.production_weight_scale_products p
join public.production_weight_scale_lots l on l.product_config_id = p.id
join public.production_departments d on d.id = p.department_id
join public.products_cache pc on pc.sku_code = p.sku_code
where p.sku_code = 'WKB-0002'
  and l.lot_code = '2509260002-1'
for update of p, l;

do $$
begin
  if (select count(*) from before_receipts) <> 5
     or (select count(*) from before_issue_items) <> 5
     or (select count(*) from before_movements) <> 10
     or (select count(*) from correction_target) <> 1 then
    raise exception 'Correction scope mismatch: receipts %, issue items %, movements %, targets %',
      (select count(*) from before_receipts),
      (select count(*) from before_issue_items),
      (select count(*) from before_movements),
      (select count(*) from correction_target);
  end if;

  if exists (
    select 1
    from before_receipts r
    join public.production_weight_scale_products p on p.id = r.product_config_id
    join public.production_weight_scale_lots l on l.id = r.lot_id
    where p.sku_code <> 'WKB-0002-2'
       or l.lot_code <> '2509260002-1'
       or r.status <> 'recorded'
       or r.barcode not in (
         '25092600220001', '25092600220002', '25092600220003',
         '25092600220004', '25092600220005'
       )
  ) or round((select sum(net_weight_kg) from before_receipts)::numeric, 3) <> 63.850 then
    raise exception 'Receipt precondition failed';
  end if;

  if exists (
    select 1
    from before_issue_items i
    join public.production_stock_issue_documents d on d.id = i.issue_document_id
    where i.product_code <> 'WKB-0002-2'
       or i.product_name_snapshot <> 'เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมเรือนจำ'
       or i.lot_no <> '2509260002-1'
       or i.status <> 'confirmed'
       or d.status <> 'confirmed'
       or d.issue_type <> 'KPF'
       or d.issue_date <> date '2026-09-28'
  ) or round((select sum(weight_kg) from before_issue_items)::numeric, 3) <> 63.850 then
    raise exception 'Issue precondition failed';
  end if;

  if exists (
    select 1
    from before_movements m
    where m.product_code <> 'WKB-0002-2'
       or m.lot_no <> '2509260002-1'
       or m.movement_type not in ('receipt_in', 'issue_out')
  )
  or (select count(*) from before_movements where movement_type = 'receipt_in') <> 5
  or (select count(*) from before_movements where movement_type = 'issue_out') <> 5
  or round((select sum(weight_in_kg) from before_movements)::numeric, 3) <> 63.850
  or round((select sum(weight_out_kg) from before_movements)::numeric, 3) <> 63.850 then
    raise exception 'Movement precondition failed';
  end if;

  if exists (
    select 1
    from public.production_stock_movements m
    where m.metadata ->> 'sourceIssueItemId' in (select id::text from before_issue_items)
      and m.movement_type not in ('issue_out')
  ) then
    raise exception 'Downstream return, waste, or adjustment exists';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('receipts', (select jsonb_agg(to_jsonb(r)) from before_receipts r), 'issueItems', (select jsonb_agg(to_jsonb(i)) from before_issue_items i), 'movements', (select jsonb_agg(to_jsonb(m)) from before_movements m), 'target', (select to_jsonb(t) from correction_target t))) to '.backups/wkb0002-2-selected-as-shell-20260925-before.json'
\endif

update public.production_weight_receipts r
set product_config_id = t.product_config_id,
    lot_id = t.lot_id,
    metadata = coalesce(r.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'productCode', t.sku_code,
        'productName', t.sku_name,
        'lotNo', t.lot_code,
        'historicalProductCorrection', jsonb_build_object(
          'fromProductCode', 'WKB-0002-2',
          'toProductCode', t.sku_code,
          'reason', 'ผู้ใช้งานยืนยันว่าเลือกสินค้าเนื้อขนมเรือนจำแทนเปลือกขนมในตอนชั่งเข้า',
          'correctedAt', now()
        )
      )
from correction_target t
where r.id in (select id from correction_receipt_ids);

update public.production_stock_issue_items i
set product_code = t.sku_code,
    product_name_snapshot = t.sku_name,
    category_code = t.iccat_code,
    lot_no = t.lot_code,
    uom_name = t.uom_name,
    metadata = coalesce(i.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'historicalProductCorrection', jsonb_build_object(
          'fromProductCode', 'WKB-0002-2',
          'toProductCode', t.sku_code,
          'reason', 'แก้ตามใบชั่งเข้าต้นทาง',
          'correctedAt', now()
        )
      )
from correction_target t
where i.source_receipt_id in (select id from correction_receipt_ids);

update public.production_stock_movements m
set product_code = t.sku_code,
    product_name_snapshot = t.sku_name,
    category_code = t.iccat_code,
    lot_no = t.lot_code,
    uom_name = t.uom_name,
    metadata = coalesce(m.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'historicalProductCorrection', jsonb_build_object(
          'fromProductCode', 'WKB-0002-2',
          'toProductCode', t.sku_code,
          'reason', 'แก้ตามใบชั่งเข้าต้นทาง',
          'correctedAt', now()
        )
      )
from correction_target t
where m.id in (select id from before_movements);

do $$
begin
  if exists (
    select 1
    from before_receipts b
    join public.production_weight_receipts r on r.id = b.id
    join correction_target t on true
    where r.product_config_id <> t.product_config_id
       or r.lot_id <> t.lot_id
       or r.net_weight_kg <> b.net_weight_kg
       or r.barcode is distinct from b.barcode
       or r.weighed_at <> b.weighed_at
  ) then
    raise exception 'Receipt verification failed';
  end if;

  if exists (
    select 1
    from before_issue_items b
    join public.production_stock_issue_items i on i.id = b.id
    join correction_target t on true
    where i.product_code <> t.sku_code
       or i.product_name_snapshot <> t.sku_name
       or i.lot_no <> t.lot_code
       or i.quantity <> b.quantity
       or i.weight_kg <> b.weight_kg
       or i.barcode <> b.barcode
       or i.status <> b.status
  ) then
    raise exception 'Issue verification failed';
  end if;

  if exists (
    select 1
    from before_movements b
    join public.production_stock_movements m on m.id = b.id
    join correction_target t on true
    where m.product_code <> t.sku_code
       or m.product_name_snapshot <> t.sku_name
       or m.lot_no <> t.lot_code
       or m.quantity_in <> b.quantity_in
       or m.quantity_out <> b.quantity_out
       or m.weight_in_kg <> b.weight_in_kg
       or m.weight_out_kg <> b.weight_out_kg
       or m.movement_date <> b.movement_date
       or m.source_document_no is distinct from b.source_document_no
  ) then
    raise exception 'Movement verification failed';
  end if;

  if round((
    select sum(weight_in_kg - weight_out_kg)
    from public.production_stock_movements
    where id in (select id from before_movements)
  )::numeric, 3) <> 0.000 then
    raise exception 'Corrected chain is not stock neutral';
  end if;
end;
$$;

select t.sku_code,
       t.sku_name,
       t.lot_code,
       (select count(*) from public.production_weight_receipts where id in (select id from correction_receipt_ids)) as receipt_count,
       round((select sum(net_weight_kg) from public.production_weight_receipts where id in (select id from correction_receipt_ids))::numeric, 3) as receipt_weight_kg,
       (select count(*) from public.production_stock_issue_items where id in (select id from before_issue_items)) as issue_count,
       round((select sum(weight_kg) from public.production_stock_issue_items where id in (select id from before_issue_items))::numeric, 3) as issue_weight_kg,
       round((select sum(weight_in_kg) from public.production_stock_movements where id in (select id from before_movements))::numeric, 3) as receipt_movement_weight_kg,
       round((select sum(weight_out_kg) from public.production_stock_movements where id in (select id from before_movements))::numeric, 3) as issue_movement_weight_kg
from correction_target t;

\if :APPLY
commit;
\else
rollback;
\endif
