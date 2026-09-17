\pset pager off
begin read only;

select product_code,lot_no,inbound_quantity,inbound_weight_kg,
       issue_quantity,issue_weight_kg,return_quantity,return_weight_kg,
       waste_quantity,waste_weight_kg,actual_quantity,actual_weight_kg,
       balance_quantity,balance_weight_kg
from public.get_production_stock_lot_balances(
  (select id from public.production_departments where code='KP13' limit 1),
  array['WKB-0048']
)
order by lot_no;

do $$ begin
  if exists (
    select 1 from public.get_production_stock_lot_balances(
      (select id from public.production_departments where code='KP13' limit 1),null
    ) r
    where r.balance_quantity<>0 and r.inbound_quantity=0
      and r.issue_quantity=0 and r.return_quantity=0 and r.waste_quantity=0
  ) then
    raise exception 'Cumulative columns are unexpectedly empty for active LOT rows';
  end if;
end $$;

commit;
