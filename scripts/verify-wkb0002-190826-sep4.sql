\pset pager off
with opening as (
  select balance_quantity, balance_weight_kg
  from public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',date '2026-09-04',timestamptz '2026-09-05 23:59:59.999+07',
    null,array['WKB-0002']
  ) where lot_no='1908260002-1'
), issued as (
  select sum(i.quantity) quantity,sum(i.weight_kg) weight_kg
  from public.production_stock_issue_items i
  join public.production_stock_issue_documents d on d.id=i.issue_document_id
  where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
    and d.issue_date=date '2026-09-04'
    and i.status='confirmed' and d.status='confirmed'
)
select opening.balance_quantity opening_quantity,
       opening.balance_weight_kg opening_weight_kg,
       issued.quantity issued_quantity,issued.weight_kg issued_weight_kg,
       opening.balance_quantity-issued.quantity closing_quantity,
       opening.balance_weight_kg-issued.weight_kg closing_weight_kg
from opening cross join issued;

with checks(report_date,cutoff) as (values
  (date '2026-09-01',timestamptz '2026-09-02 23:59:59.999+07'),
  (date '2026-09-04',timestamptz '2026-09-05 23:59:59.999+07')
)
select checks.report_date,sum(i.quantity) issue_quantity,sum(i.weight_kg) issue_weight_kg
from checks
join public.production_stock_issue_documents d on d.issue_date=checks.report_date
join public.production_stock_issue_items i on i.issue_document_id=d.id
where i.product_code='WKB-0002' and i.lot_no='1908260002-1'
  and d.issued_at<=checks.cutoff and i.created_at<=checks.cutoff
  and (d.restored_at is null or d.restored_at<=checks.cutoff)
  and (i.restored_at is null or i.restored_at<=checks.cutoff)
  and (d.status='confirmed' or (d.status='voided' and d.voided_at>checks.cutoff))
  and (i.status='confirmed' or (i.status='voided' and i.voided_at>checks.cutoff))
group by checks.report_date order by checks.report_date;
