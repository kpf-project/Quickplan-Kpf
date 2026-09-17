begin;

drop function if exists public.get_production_stock_lot_balances(uuid, text[]);

create function public.get_production_stock_lot_balances(
  p_department_id uuid,
  p_product_codes text[] default null
)
returns table (
  product_code text,
  product_name text,
  lot_no text,
  inbound_quantity numeric,
  inbound_weight_kg numeric,
  issue_quantity numeric,
  issue_weight_kg numeric,
  return_quantity numeric,
  return_weight_kg numeric,
  waste_quantity numeric,
  waste_weight_kg numeric,
  actual_quantity numeric,
  actual_weight_kg numeric,
  balance_quantity numeric,
  balance_weight_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with rows as (
    select o.product_code,o.lot_no,max(o.product_name_snapshot) product_name,
      0::numeric inbound_quantity,0::numeric inbound_weight_kg,
      0::numeric issue_quantity,0::numeric issue_weight_kg,
      0::numeric return_quantity,0::numeric return_weight_kg,
      0::numeric waste_quantity,0::numeric waste_weight_kg,
      sum(o.quantity) balance_quantity,sum(o.weight_kg) balance_weight_kg
    from public.production_stock_opening_balances o
    where o.department_id=p_department_id
      and (p_product_codes is null or cardinality(p_product_codes)=0 or o.product_code=any(p_product_codes))
    group by o.product_code,o.lot_no

    union all

    select p.sku_code,l.lot_code,max(coalesce(c.sku_name,p.sku_code)),
      count(r.id)::numeric,sum(r.net_weight_kg),0,0,0,0,0,0,
      count(r.id)::numeric,sum(r.net_weight_kg)
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id=r.product_config_id
    join public.production_weight_scale_lots l on l.id=r.lot_id
    left join public.products_cache c on c.sku_code=p.sku_code
    where p.department_id=p_department_id and r.status='recorded'
      and coalesce(r.metadata->>'isReturn','false')<>'true'
      and (p_product_codes is null or cardinality(p_product_codes)=0 or p.sku_code=any(p_product_codes))
    group by p.sku_code,l.lot_code

    union all

    select i.product_code,i.lot_no,max(i.product_name_snapshot),0,0,
      sum(i.quantity),sum(i.weight_kg),0,0,0,0,
      -sum(i.quantity),-sum(i.weight_kg)
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i on i.issue_document_id=d.id and i.status='confirmed'
    where d.department_id=p_department_id and d.status='confirmed'
      and (p_product_codes is null or cardinality(p_product_codes)=0 or i.product_code=any(p_product_codes))
    group by i.product_code,i.lot_no

    union all

    select m.product_code,m.lot_no,max(m.product_name_snapshot),0,0,0,0,
      sum(case when m.movement_type='return_in' then m.quantity_in else 0 end),
      sum(case when m.movement_type='return_in' then m.weight_in_kg else 0 end),
      sum(case when m.movement_type='waste_out' then m.quantity_out else 0 end),
      sum(case when m.movement_type='waste_out' then m.weight_out_kg else 0 end),
      sum(case when m.movement_type='return_in' then m.quantity_in else -m.quantity_out end),
      sum(case when m.movement_type='return_in' then m.weight_in_kg else -m.weight_out_kg end)
    from public.production_stock_movements m
    left join public.production_stock_issue_items source_item
      on source_item.id::text=nullif(m.metadata->>'sourceIssueItemId','')
    left join public.production_stock_issue_documents source_document
      on source_document.id=source_item.issue_document_id
    where m.department_id=p_department_id and m.movement_type in ('return_in','waste_out')
      and (p_product_codes is null or cardinality(p_product_codes)=0 or m.product_code=any(p_product_codes))
      and (nullif(m.metadata->>'sourceIssueItemId','') is null
           or (source_item.status='confirmed' and source_document.status='confirmed'))
    group by m.product_code,m.lot_no
  ), grouped as (
    select rows.product_code,rows.lot_no,max(rows.product_name) product_name,
      sum(rows.inbound_quantity) inbound_quantity,sum(rows.inbound_weight_kg) inbound_weight_kg,
      sum(rows.issue_quantity) issue_quantity,sum(rows.issue_weight_kg) issue_weight_kg,
      sum(rows.return_quantity) return_quantity,sum(rows.return_weight_kg) return_weight_kg,
      sum(rows.waste_quantity) waste_quantity,sum(rows.waste_weight_kg) waste_weight_kg,
      sum(rows.balance_quantity) balance_quantity,sum(rows.balance_weight_kg) balance_weight_kg
    from rows group by rows.product_code,rows.lot_no
  )
  select grouped.product_code,grouped.product_name,grouped.lot_no,
    round(grouped.inbound_quantity,3),round(grouped.inbound_weight_kg,3),
    round(grouped.issue_quantity,3),round(grouped.issue_weight_kg,3),
    round(grouped.return_quantity,3),round(grouped.return_weight_kg,3),
    round(grouped.waste_quantity,3),round(grouped.waste_weight_kg,3),
    greatest(round(grouped.issue_quantity-grouped.return_quantity+grouped.waste_quantity,3),0),
    greatest(round(grouped.issue_weight_kg-grouped.return_weight_kg+grouped.waste_weight_kg,3),0),
    round(grouped.balance_quantity,3),round(grouped.balance_weight_kg,3)
  from grouped
  where grouped.balance_quantity>0 or grouped.balance_weight_kg>0
  order by grouped.product_code,grouped.lot_no;
$$;

revoke all on function public.get_production_stock_lot_balances(uuid,text[]) from public,anon,authenticated;
grant execute on function public.get_production_stock_lot_balances(uuid,text[]) to service_role;

notify pgrst,'reload schema';
commit;
