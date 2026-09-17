begin read only;

with lot_receipts as (
  select
    r.id,
    r.barcode,
    r.net_weight_kg,
    r.status receipt_status,
    r.weighed_at,
    coalesce(r.metadata->>'productionDate', timezone('Asia/Bangkok', r.weighed_at)::date::text) production_date,
    coalesce((r.metadata->>'isReturn')::boolean, false) is_return,
    r.metadata->>'sourceIssueItemId' return_source_issue_item_id
  from public.production_weight_receipts r
  join public.production_weight_scale_products p on p.id = r.product_config_id
  join public.production_weight_scale_lots l on l.id = r.lot_id
  where p.sku_code = 'WKB-0054'
    and l.lot_code = '2908260054-1'
), active_issues as (
  select
    i.source_receipt_id,
    i.barcode,
    i.weight_kg,
    d.issue_date,
    i.status item_status,
    d.status document_status
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id = i.issue_document_id
  where i.product_code = 'WKB-0054'
    and i.lot_no = '2908260054-1'
    and i.status = 'confirmed'
    and d.status = 'confirmed'
)
select
  r.barcode,
  r.net_weight_kg,
  r.receipt_status,
  r.production_date,
  timezone('Asia/Bangkok', r.weighed_at) weighed_at_bangkok,
  r.is_return,
  case when i.source_receipt_id is null then 'available' else 'issued' end calculated_status,
  i.issue_date
from lot_receipts r
left join active_issues i on i.source_receipt_id = r.id
order by r.production_date, r.weighed_at, r.barcode;

with lot_receipts as (
  select
    r.id,
    r.net_weight_kg,
    r.status,
    coalesce(r.metadata->>'productionDate', timezone('Asia/Bangkok', r.weighed_at)::date::text)::date production_date,
    coalesce((r.metadata->>'isReturn')::boolean, false) is_return
  from public.production_weight_receipts r
  join public.production_weight_scale_products p on p.id = r.product_config_id
  join public.production_weight_scale_lots l on l.id = r.lot_id
  where p.sku_code = 'WKB-0054' and l.lot_code = '2908260054-1'
), available as (
  select r.*
  from lot_receipts r
  where r.status = 'recorded'
    and not exists (
      select 1
      from public.production_stock_issue_items i
      join public.production_stock_issue_documents d on d.id = i.issue_document_id
      where i.source_receipt_id = r.id
        and i.status = 'confirmed' and d.status = 'confirmed'
    )
)
select
  case
    when not is_return and production_date between date '2026-08-29' and date '2026-08-30'
      then 'detail_filter_29_30_production_only'
    when not is_return then 'all_available_production_receipts'
    else 'available_return_receipts'
  end bucket,
  count(*) quantity,
  round(sum(net_weight_kg), 3) weight_kg
from available
group by 1
order by 1;

select *
from public.get_production_stock_lot_balances(
  (select id from public.production_departments where code = 'KP13' limit 1),
  '03',
  array['WKB-0054']
)
where lot_no = '2908260054-1';

commit;
