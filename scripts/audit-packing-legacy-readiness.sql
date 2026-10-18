-- Read-only inventory before planning the packing/WIP cutover. No company rows are changed.
begin read only;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in (
  'production_non_wage_packing_outputs','production_non_wage_packing_carryovers',
  'production_fg_wip_documents','production_wip_can_movements',
  'production_wip_opening_balance_movements','production_wip_opening_entries')
order by table_name,ordinal_position;
select 'legacy_packing' as source,count(*) as rows,min(work_date) as first_date,max(work_date) as last_date,
  sum(closing_packs) as recorded_closing_packs,sum(closing_sachets) as recorded_closing_sachets
from public.production_non_wage_packing_outputs;
select 'legacy_fg_wip' as source,count(*) as rows,min(production_date) as first_date,max(production_date) as last_date
from public.production_fg_wip_documents;
select source,count(*) as lots,sum(remaining) as remaining from (
  select 'legacy_wip' as source,product_code,barcode,lot_no,sum(quantity_in-quantity_out) as remaining
  from public.production_wip_can_movements group by product_code,barcode,lot_no
  union all
  select 'legacy_opening',product_code,barcode,lot_no,sum(quantity_in-quantity_out)
  from public.production_wip_opening_balance_movements group by product_code,barcode,lot_no
) balances group by source;
select source,product_code,lot_no,remaining from (
  select 'legacy_wip' as source,product_code,lot_no,barcode,sum(quantity_in-quantity_out) as remaining
  from public.production_wip_can_movements group by product_code,lot_no,barcode
  union all
  select 'legacy_opening',product_code,lot_no,barcode,sum(quantity_in-quantity_out)
  from public.production_wip_opening_balance_movements group by product_code,lot_no,barcode
) balances where remaining<>0 order by source,product_code,lot_no;
select fg_product_code,wip_product_code,count(*) as documents
from public.production_fg_wip_documents group by fg_product_code,wip_product_code order by fg_product_code,wip_product_code;
rollback;
