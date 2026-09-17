\pset pager off
begin read only;

select 'opening' section,dates.report_date,rows.product_code,rows.lot_no,
       rows.balance_quantity quantity,rows.balance_weight_kg weight_kg
from (values (date '2026-09-01'),(date '2026-09-03'),(date '2026-09-04')) dates(report_date)
cross join lateral public.get_production_stock_opening_as_of(
  (select id from public.production_departments where code='KP13' limit 1),
  '03',dates.report_date,now(),null,array['WKB-0002','WKB-0048','WKB-0053']) rows
where (rows.product_code,rows.lot_no) in (
  ('WKB-0002','1908260002-1'),('WKB-0048','2708260048-1'),('WKB-0053','2408260053-1'))
order by dates.report_date,rows.product_code;

select 'issue' section,d.issue_date,i.product_code,i.lot_no,
       sum(i.quantity) quantity,sum(i.weight_kg) weight_kg
from public.production_stock_issue_documents d
join public.production_stock_issue_items i on i.issue_document_id=d.id
where d.status='confirmed' and i.status='confirmed'
  and d.issue_date between '2026-09-01' and '2026-09-04'
  and (i.product_code,i.lot_no) in (
    ('WKB-0002','1908260002-1'),('WKB-0048','2708260048-1'),('WKB-0053','2408260053-1'))
group by d.issue_date,i.product_code,i.lot_no
order by d.issue_date,i.product_code;

commit;
