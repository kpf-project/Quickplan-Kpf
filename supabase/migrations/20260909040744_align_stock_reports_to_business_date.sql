-- Business dates drive all operational stock reports. System timestamps remain audit-only.
begin;
create or replace function public.get_production_stock_opening_as_of(
  p_department_id uuid,
  p_category_code text,
  p_date_from date,
  p_as_of_cutoff timestamptz,
  p_issue_types text[] default null,
  p_product_codes text[] default null
)
returns table (
  product_code text,
  product_name text,
  lot_no text,
  balance_quantity numeric,
  balance_weight_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with opening_rows as (
    select o.product_code,o.lot_no,max(o.product_name_snapshot) product_name,
           sum(o.quantity) quantity_delta,sum(o.weight_kg) weight_delta
    from public.production_stock_opening_balances o
    where o.department_id=p_department_id and o.category_code=p_category_code
      and o.balance_date<p_date_from
      and (p_product_codes is null or cardinality(p_product_codes)=0 or o.product_code=any(p_product_codes))
    group by o.product_code,o.lot_no
  ), receipt_rows as (
    select p.sku_code product_code,l.lot_code lot_no,
           max(coalesce(c.sku_name,p.sku_code)) product_name,
           count(r.id)::numeric quantity_delta,sum(r.net_weight_kg) weight_delta
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id=r.product_config_id
    join public.production_weight_scale_lots l on l.id=r.lot_id
    left join public.products_cache c on c.sku_code=p.sku_code
    where p.department_id=p_department_id
      and timezone('Asia/Bangkok',r.weighed_at)::date<p_date_from
      and r.status='recorded'
      and coalesce(r.metadata->>'isReturn','false')<>'true'
      and (p_product_codes is null or cardinality(p_product_codes)=0 or p.sku_code=any(p_product_codes))
    group by p.sku_code,l.lot_code
  ), active_issues as (
    select i.id,i.product_code,i.lot_no,
           max(i.product_name_snapshot) over(partition by i.product_code,i.lot_no) product_name,
           i.quantity,i.weight_kg
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i on i.issue_document_id=d.id
    where d.department_id=p_department_id and i.category_code=p_category_code
      and d.issue_date<p_date_from
      and d.status='confirmed' and i.status='confirmed'
      and (p_issue_types is null or cardinality(p_issue_types)=0 or d.issue_type=any(p_issue_types))
      and (p_product_codes is null or cardinality(p_product_codes)=0 or i.product_code=any(p_product_codes))
  ), issue_rows as (
    select product_code,lot_no,max(product_name) product_name,
           -sum(quantity) quantity_delta,-sum(weight_kg) weight_delta
    from active_issues group by product_code,lot_no
  ), movement_rows as (
    select m.product_code,m.lot_no,max(m.product_name_snapshot) product_name,
           sum(case when m.movement_type='return_in' then m.quantity_in else -m.quantity_out end) quantity_delta,
           sum(case when m.movement_type='return_in' then m.weight_in_kg else -m.weight_out_kg end) weight_delta
    from public.production_stock_movements m
    left join active_issues source on source.id::text=nullif(m.metadata->>'sourceIssueItemId','')
    where m.department_id=p_department_id and m.category_code=p_category_code
      and m.movement_type in ('return_in','waste_out') and m.movement_date<p_date_from
      and (nullif(m.metadata->>'sourceIssueItemId','') is null or source.id is not null)
      and (p_product_codes is null or cardinality(p_product_codes)=0 or m.product_code=any(p_product_codes))
    group by m.product_code,m.lot_no
  ), grouped as (
    select rows.product_code,rows.lot_no,max(rows.product_name) product_name,
           sum(rows.quantity_delta) balance_quantity,sum(rows.weight_delta) balance_weight_kg
    from (
      select * from opening_rows union all select * from receipt_rows
      union all select * from issue_rows union all select * from movement_rows
    ) rows group by rows.product_code,rows.lot_no
  )
  select grouped.product_code,grouped.product_name,grouped.lot_no,
         round(grouped.balance_quantity,3),round(grouped.balance_weight_kg,3)
  from grouped;
$$;

comment on function public.get_production_stock_opening_as_of(uuid,text,date,timestamptz,text[],text[])
is 'Opening stock by business dates and current active status; p_as_of_cutoff retained for API compatibility and audit timestamps never decide report membership.';

revoke all on function public.get_production_stock_opening_as_of(uuid,text,date,timestamptz,text[],text[]) from public,anon,authenticated;
grant execute on function public.get_production_stock_opening_as_of(uuid,text,date,timestamptz,text[],text[]) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
