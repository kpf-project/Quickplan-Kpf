begin read only;

select 'opening_balance' as source,
       sum(quantity) quantity,
       sum(weight_kg) weight_kg
from public.production_stock_opening_balances
where product_code = 'WKB-0048'
  and lot_no = '2708260048-1';

select d.issue_date,
       (i.issued_at at time zone 'Asia/Bangkok')::date as scan_date,
       count(*) quantity,
       round(sum(i.weight_kg)::numeric, 2) as weight_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
where i.product_code = 'WKB-0048'
  and i.lot_no = '2708260048-1'
  and d.issue_date = '2026-09-02'
  and i.status = 'confirmed'
  and d.status = 'confirmed'
group by d.issue_date, scan_date
order by scan_date;

select d.issue_no,
       d.issue_date,
       i.barcode,
       i.weight_kg,
       (i.issued_at at time zone 'Asia/Bangkok') as scan_time,
       i.status,
       d.status as document_status
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
where i.product_code = 'WKB-0048'
  and i.lot_no = '2708260048-1'
  and d.issue_date = '2026-09-02'
order by i.issued_at, i.barcode;

select movement_date,
       movement_type,
       count(*) quantity,
       round(sum(weight_in_kg)::numeric, 2) weight_in_kg,
       round(sum(weight_out_kg)::numeric, 2) weight_out_kg
from public.production_stock_movements
where product_code = 'WKB-0048'
  and lot_no = '2708260048-1'
  and movement_date = '2026-09-02'
group by movement_date, movement_type
order by movement_type;

select movement_no,
       movement_type,
       movement_date,
       movement_at at time zone 'Asia/Bangkok' as movement_time,
       weight_in_kg,
       weight_out_kg,
       metadata ->> 'sourceBarcode' as source_barcode,
       metadata ->> 'sourceIssueItemId' as source_issue_item_id,
       metadata
from public.production_stock_movements
where product_code = 'WKB-0048'
  and lot_no = '2708260048-1'
  and movement_date between '2026-09-01' and '2026-09-03'
order by movement_date, movement_at, movement_no;

select r.barcode,
       r.net_weight_kg,
       r.status,
       r.weighed_at at time zone 'Asia/Bangkok' as weighed_time,
       r.metadata ->> 'isReturn' as is_return,
       r.metadata ->> 'sourceBarcode' as source_barcode
from public.production_weight_receipts r
join public.production_weight_scale_lots l on l.id = r.lot_id
join public.production_weight_scale_products p on p.id = r.product_config_id
where upper(p.sku_code) = 'WKB-0048'
  and l.lot_code = '2708260048-1'
  and r.weighed_at >= '2026-09-02T00:00:00+07:00'
  and r.weighed_at < '2026-09-03T00:00:00+07:00'
order by r.weighed_at, r.barcode;

with active_items as (
  select i.id, i.barcode, round(i.weight_kg::numeric, 2) weight_kg
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id = i.issue_document_id
  where i.product_code = 'WKB-0048'
    and i.lot_no = '2708260048-1'
    and d.issue_date = '2026-09-02'
    and i.status = 'confirmed'
    and d.status = 'confirmed'
)
select barcode, weight_kg
from active_items
where weight_kg = 108.41
union all
select a.barcode || ' + ' || b.barcode,
       a.weight_kg + b.weight_kg
from active_items a
join active_items b on b.id > a.id
where a.weight_kg + b.weight_kg = 108.41;

with ordered as (
  select i.barcode,
         round(i.weight_kg::numeric, 2) weight_kg,
         i.issued_at,
         row_number() over (order by i.issued_at, i.id) rn
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id = i.issue_document_id
  where i.product_code = 'WKB-0048'
    and i.lot_no = '2708260048-1'
    and d.issue_date = '2026-09-02'
    and i.status = 'confirmed'
    and d.status = 'confirmed'
), ranges as (
  select a.rn start_rn,
         b.rn end_rn,
         round(sum(x.weight_kg), 2) weight_kg,
         string_agg(x.barcode, ',' order by x.rn) barcodes
  from ordered a
  join ordered b on b.rn >= a.rn
  join ordered x on x.rn between a.rn and b.rn
  group by a.rn, b.rn
)
select 'contiguous_range' match_type, start_rn, end_rn, weight_kg, barcodes
from ranges
where weight_kg in (71.42, 108.41)
order by weight_kg, start_rn;

select (i.issued_at at time zone 'Asia/Bangkok')::date scan_date,
       extract(hour from i.issued_at at time zone 'Asia/Bangkok')::integer scan_hour,
       count(*) quantity,
       round(sum(i.weight_kg)::numeric, 2) weight_kg,
       string_agg(i.barcode, ',' order by i.issued_at) barcodes
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
where i.product_code = 'WKB-0048'
  and i.lot_no = '2708260048-1'
  and d.issue_date = '2026-09-02'
  and i.status = 'confirmed'
  and d.status = 'confirmed'
group by scan_date, scan_hour
order by scan_date, scan_hour;

commit;
