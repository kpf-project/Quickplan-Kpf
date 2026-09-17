begin read only;
with opening as (
 select coalesce(sum(quantity),0) qty,coalesce(sum(weight_kg),0) kg from public.production_stock_opening_balances
 where product_code='WKB-0053' and lot_no='2408260053-1'
), receipts as (
 select count(*) qty,coalesce(sum(net_weight_kg),0) kg from public.production_weight_receipts
 where status='recorded' and lot_id='32231b4f-d00a-4075-8b03-cdd456a0d849'
   and coalesce((metadata->>'isReturn')::boolean,false)=false
   and (weighed_at at time zone 'Asia/Bangkok')::date<'2026-09-03'
), issues as (
 select coalesce(sum(i.quantity),0) qty,coalesce(sum(i.weight_kg),0) kg
 from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where i.product_code='WKB-0053' and i.lot_no='2408260053-1' and i.status='confirmed' and d.status='confirmed' and d.issue_date<'2026-09-03'
), returns as (
 select coalesce(sum(m.quantity_in),0) qty,coalesce(sum(m.weight_in_kg),0) kg
 from public.production_stock_movements m
 join public.production_stock_issue_items i on i.id=(m.metadata->>'sourceIssueItemId')::uuid
 join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where m.product_code='WKB-0053' and m.lot_no='2408260053-1' and m.movement_type='return_in' and m.movement_date<'2026-09-03' and i.status='confirmed' and d.status='confirmed'
), waste as (
 select coalesce(sum(m.quantity_out),0) qty,coalesce(sum(m.weight_out_kg),0) kg
 from public.production_stock_movements m
 where m.product_code='WKB-0053' and m.lot_no='2408260053-1' and m.movement_type='waste_out' and m.movement_date<'2026-09-03'
), day_issue as (
 select coalesce(sum(i.quantity),0) qty,coalesce(sum(i.weight_kg),0) kg
 from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
 where i.product_code='WKB-0053' and i.lot_no='2408260053-1' and i.status='confirmed' and d.status='confirmed' and d.issue_date='2026-09-03'
)
select o.qty+r.qty+rt.qty-i.qty-w.qty opening_qty,
       o.kg+r.kg+rt.kg-i.kg-w.kg opening_kg,
       di.qty issue_qty,di.kg issue_kg,
       o.qty+r.qty+rt.qty-i.qty-w.qty-di.qty balance_qty,
       o.kg+r.kg+rt.kg-i.kg-w.kg-di.kg balance_kg
from opening o cross join receipts r cross join issues i cross join returns rt cross join waste w cross join day_issue di;
commit;

begin read only;
with dates as (
  select generate_series(date '2026-09-01',date '2026-09-04',interval '1 day')::date report_date
), opening as (
  select dates.report_date,r.balance_quantity opening_qty,r.balance_weight_kg opening_kg
  from dates cross join lateral public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',dates.report_date,now(),null,array['WKB-0053']) r
  where r.lot_no='2408260053-1'
), issues as (
  select d.issue_date report_date,sum(i.quantity) issue_qty,sum(i.weight_kg) issue_kg
  from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0053' and i.lot_no='2408260053-1'
    and i.status='confirmed' and d.status='confirmed'
    and d.issue_date between '2026-09-01' and '2026-09-04'
  group by d.issue_date
), movements as (
  select m.movement_date report_date,
    sum(case when m.movement_type='return_in' then m.quantity_in else -m.quantity_out end) quantity_delta,
    sum(case when m.movement_type='return_in' then m.weight_in_kg else -m.weight_out_kg end) weight_delta
  from public.production_stock_movements m
  left join public.production_stock_issue_items i on i.id::text=nullif(m.metadata->>'sourceIssueItemId','')
  left join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where m.product_code='WKB-0053' and m.lot_no='2408260053-1'
    and m.movement_type in ('return_in','waste_out')
    and m.movement_date between '2026-09-01' and '2026-09-04'
    and (nullif(m.metadata->>'sourceIssueItemId','') is null or (i.status='confirmed' and d.status='confirmed'))
  group by m.movement_date
), totals as (
  select o.report_date,o.opening_qty,o.opening_kg,
    coalesce(i.issue_qty,0) issue_qty,coalesce(i.issue_kg,0) issue_kg,
    coalesce(m.quantity_delta,0) movement_qty,coalesce(m.weight_delta,0) movement_kg,
    o.opening_qty-coalesce(i.issue_qty,0)+coalesce(m.quantity_delta,0) closing_qty,
    o.opening_kg-coalesce(i.issue_kg,0)+coalesce(m.weight_delta,0) closing_kg
  from opening o left join issues i using(report_date) left join movements m using(report_date)
)
select * from totals order by report_date;

do $$ begin
  if exists (
    with dates as (select generate_series(date '2026-09-01',date '2026-09-04',interval '1 day')::date report_date),
    opening as (
      select dates.report_date,r.balance_quantity qty,r.balance_weight_kg kg
      from dates cross join lateral public.get_production_stock_opening_as_of(
        (select id from public.production_departments where code='KP13' limit 1),'03',dates.report_date,now(),null,array['WKB-0053']) r
      where r.lot_no='2408260053-1')
    select 1 from opening where qty<0 or kg<0
  ) then raise exception 'Negative WKB-0053 opening remains'; end if;
end $$;
commit;
