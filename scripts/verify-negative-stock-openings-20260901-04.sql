\pset pager off
with dates as (
  select generate_series(date '2026-09-01',date '2026-09-04',interval '1 day')::date report_date
), balances as (
  select dates.report_date, rows.*
  from dates
  cross join lateral public.get_production_stock_opening_as_of(
    (select id from public.production_departments where code='KP13' limit 1),
    '03',dates.report_date,
    ((dates.report_date+1)::timestamp at time zone 'Asia/Bangkok'),
    null,null
  ) rows
)
select report_date,product_code,lot_no,balance_quantity,balance_weight_kg
from balances
where balance_quantity<0 or balance_weight_kg<0
order by report_date,product_code,lot_no;
