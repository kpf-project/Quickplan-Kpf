\pset pager off
begin read only;

\echo '=== RECEIPTS BY BUSINESS DATE / CURRENT STATUS ==='
select (r.weighed_at at time zone 'Asia/Bangkok')::date business_date,
       r.status,
       coalesce((r.metadata->>'isReturn')::boolean,false) is_return,
       count(*) quantity,
       round(sum(r.net_weight_kg),3) weight_kg
from public.production_weight_receipts r
join public.production_weight_scale_lots l on l.id=r.lot_id
where l.lot_code='2408260053-1'
group by 1,2,3
order by 1,3,2;

\echo '=== ISSUES BY USER-SELECTED DATE / CURRENT STATUS ==='
select d.issue_date business_date,d.status document_status,i.status item_status,
       count(*) quantity,round(sum(i.weight_kg),3) weight_kg
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id=i.issue_document_id
where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
group by 1,2,3
order by 1,2,3;

\echo '=== RETURNS AND WASTE BY BUSINESS DATE / CURRENT SOURCE STATUS ==='
select m.movement_date business_date,m.movement_type,
       coalesce(i.status,'unlinked') source_item_status,
       coalesce(d.status,'unlinked') source_document_status,
       sum(m.quantity_in) quantity_in,round(sum(m.weight_in_kg),3) weight_in_kg,
       sum(m.quantity_out) quantity_out,round(sum(m.weight_out_kg),3) weight_out_kg
from public.production_stock_movements m
left join public.production_stock_issue_items i
  on i.id::text=nullif(m.metadata->>'sourceIssueItemId','')
left join public.production_stock_issue_documents d on d.id=i.issue_document_id
where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
  and m.movement_type in ('return_in','waste_out')
group by 1,2,3,4
order by 1,2,3,4;

\echo '=== CANONICAL CURRENT-STATE LEDGER BY BUSINESS DATE ==='
with seed as (
  select balance_date business_date,sum(quantity)::numeric quantity_delta,
         sum(weight_kg)::numeric weight_delta,0::numeric receipt_qty,
         0::numeric receipt_kg,0::numeric issue_qty,0::numeric issue_kg,
         0::numeric return_qty,0::numeric return_kg,
         0::numeric waste_qty,0::numeric waste_kg
  from public.production_stock_opening_balances
  where product_code='WKB-0053' and lot_no='2408260053-1'
  group by balance_date
), receipts as (
  select (r.weighed_at at time zone 'Asia/Bangkok')::date business_date,
         count(*)::numeric quantity_delta,sum(r.net_weight_kg)::numeric weight_delta,
         count(*)::numeric receipt_qty,sum(r.net_weight_kg)::numeric receipt_kg,
         0::numeric issue_qty,0::numeric issue_kg,0::numeric return_qty,
         0::numeric return_kg,0::numeric waste_qty,0::numeric waste_kg
  from public.production_weight_receipts r
  join public.production_weight_scale_lots l on l.id=r.lot_id
  where l.lot_code='2408260053-1' and r.status='recorded'
    and coalesce((r.metadata->>'isReturn')::boolean,false)=false
  group by 1
), issues as (
  select d.issue_date business_date,-sum(i.quantity)::numeric quantity_delta,
         -sum(i.weight_kg)::numeric weight_delta,0::numeric receipt_qty,
         0::numeric receipt_kg,sum(i.quantity)::numeric issue_qty,
         sum(i.weight_kg)::numeric issue_kg,0::numeric return_qty,
         0::numeric return_kg,0::numeric waste_qty,0::numeric waste_kg
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
    and i.status='confirmed' and d.status='confirmed'
  group by d.issue_date
), other_movements as (
  select m.movement_date business_date,
         sum(case when m.movement_type='return_in' then m.quantity_in else -m.quantity_out end)::numeric quantity_delta,
         sum(case when m.movement_type='return_in' then m.weight_in_kg else -m.weight_out_kg end)::numeric weight_delta,
         0::numeric receipt_qty,0::numeric receipt_kg,0::numeric issue_qty,
         0::numeric issue_kg,
         sum(case when m.movement_type='return_in' then m.quantity_in else 0 end)::numeric return_qty,
         sum(case when m.movement_type='return_in' then m.weight_in_kg else 0 end)::numeric return_kg,
         sum(case when m.movement_type='waste_out' then m.quantity_out else 0 end)::numeric waste_qty,
         sum(case when m.movement_type='waste_out' then m.weight_out_kg else 0 end)::numeric waste_kg
  from public.production_stock_movements m
  left join public.production_stock_issue_items i
    on i.id::text=nullif(m.metadata->>'sourceIssueItemId','')
  left join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
    and m.movement_type in ('return_in','waste_out')
    and (nullif(m.metadata->>'sourceIssueItemId','') is null
         or (i.status='confirmed' and d.status='confirmed'))
  group by m.movement_date
), daily as (
  select business_date,sum(quantity_delta) quantity_delta,sum(weight_delta) weight_delta,
         sum(receipt_qty) receipt_qty,sum(receipt_kg) receipt_kg,
         sum(issue_qty) issue_qty,sum(issue_kg) issue_kg,
         sum(return_qty) return_qty,sum(return_kg) return_kg,
         sum(waste_qty) waste_qty,sum(waste_kg) waste_kg
  from (select * from seed union all select * from receipts union all
        select * from issues union all select * from other_movements) x
  group by business_date
), ledger as (
  select *,coalesce(sum(quantity_delta) over(order by business_date rows between unbounded preceding and 1 preceding),0) opening_qty,
         coalesce(sum(weight_delta) over(order by business_date rows between unbounded preceding and 1 preceding),0) opening_kg,
         sum(quantity_delta) over(order by business_date) closing_qty,
         sum(weight_delta) over(order by business_date) closing_kg
  from daily
)
select business_date,opening_qty,round(opening_kg,3) opening_kg,
       receipt_qty,round(receipt_kg,3) receipt_kg,
       issue_qty,round(issue_kg,3) issue_kg,
       return_qty,round(return_kg,3) return_kg,
       waste_qty,round(waste_kg,3) waste_kg,
       closing_qty,round(closing_kg,3) closing_kg
from ledger order by business_date;

commit;
