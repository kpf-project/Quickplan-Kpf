-- Aggregate the production stock reports inside PostgreSQL so the application
-- receives only report rows. The formulas mirror production-stock-balance.js.

create index if not exists production_stock_issue_documents_confirmed_report_idx
  on public.production_stock_issue_documents (department_id, issue_date, issue_type, id)
  where status = 'confirmed';

create index if not exists production_stock_issue_items_confirmed_report_idx
  on public.production_stock_issue_items (issue_document_id, product_code, lot_no)
  include (quantity, weight_kg, product_name_snapshot)
  where status = 'confirmed';

create index if not exists production_stock_movements_report_activity_idx
  on public.production_stock_movements
    (department_id, movement_date, product_code, lot_no, movement_type)
  include (quantity_in, quantity_out, weight_in_kg, weight_out_kg, product_name_snapshot)
  where movement_type in ('return_in', 'waste_out');

create index if not exists production_stock_movements_source_issue_item_idx
  on public.production_stock_movements ((metadata ->> 'sourceIssueItemId'))
  where metadata ? 'sourceIssueItemId';

create index if not exists production_weight_receipts_recorded_lot_balance_idx
  on public.production_weight_receipts (product_config_id, lot_id)
  include (net_weight_kg)
  where status = 'recorded';

create or replace function public.get_production_stock_activity_summary(
  p_department_id uuid,
  p_date_from date,
  p_date_to date,
  p_issue_types text[] default null,
  p_product_codes text[] default null
)
returns table (
  issue_date date,
  lot_no text,
  product_code text,
  product_name text,
  issue_quantity numeric,
  issue_weight_kg numeric,
  return_quantity numeric,
  return_weight_kg numeric,
  waste_quantity numeric,
  waste_weight_kg numeric,
  actual_quantity numeric,
  actual_weight_kg numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with issue_rows as (
    select
      d.issue_date,
      i.lot_no,
      i.product_code,
      max(i.product_name_snapshot) as product_name,
      sum(i.quantity) as issue_quantity,
      sum(i.weight_kg) as issue_weight_kg,
      0::numeric as return_quantity,
      0::numeric as return_weight_kg,
      0::numeric as waste_quantity,
      0::numeric as waste_weight_kg
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i
      on i.issue_document_id = d.id
     and i.status = 'confirmed'
    where d.department_id = p_department_id
      and d.status = 'confirmed'
      and d.issue_date between p_date_from and p_date_to
      and (p_issue_types is null or cardinality(p_issue_types) = 0 or d.issue_type = any(p_issue_types))
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or i.product_code = any(p_product_codes))
    group by d.issue_date, i.lot_no, i.product_code
  ),
  movement_rows as (
    select
      m.movement_date as issue_date,
      m.lot_no,
      m.product_code,
      max(m.product_name_snapshot) as product_name,
      0::numeric as issue_quantity,
      0::numeric as issue_weight_kg,
      sum(case when m.movement_type = 'return_in' then m.quantity_in else 0 end) as return_quantity,
      sum(case when m.movement_type = 'return_in' then m.weight_in_kg else 0 end) as return_weight_kg,
      sum(case when m.movement_type = 'waste_out' then m.quantity_out else 0 end) as waste_quantity,
      sum(case when m.movement_type = 'waste_out' then m.weight_out_kg else 0 end) as waste_weight_kg
    from public.production_stock_movements m
    left join public.production_stock_issue_items source_item
      on source_item.id::text = nullif(m.metadata ->> 'sourceIssueItemId', '')
    left join public.production_stock_issue_documents source_document
      on source_document.id = source_item.issue_document_id
    where m.department_id = p_department_id
      and m.movement_type in ('return_in', 'waste_out')
      and m.movement_date between p_date_from and p_date_to
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or m.product_code = any(p_product_codes))
      and (
        nullif(m.metadata ->> 'sourceIssueItemId', '') is null
        or (source_item.status = 'confirmed' and source_document.status = 'confirmed')
      )
    group by m.movement_date, m.lot_no, m.product_code
  ),
  grouped as (
    select
      rows.issue_date,
      rows.lot_no,
      rows.product_code,
      max(rows.product_name) as product_name,
      sum(rows.issue_quantity) as issue_quantity,
      sum(rows.issue_weight_kg) as issue_weight_kg,
      sum(rows.return_quantity) as return_quantity,
      sum(rows.return_weight_kg) as return_weight_kg,
      sum(rows.waste_quantity) as waste_quantity,
      sum(rows.waste_weight_kg) as waste_weight_kg
    from (
      select * from issue_rows
      union all
      select * from movement_rows
    ) rows
    group by rows.issue_date, rows.lot_no, rows.product_code
  )
  select
    grouped.issue_date,
    grouped.lot_no,
    grouped.product_code,
    grouped.product_name,
    round(grouped.issue_quantity, 3),
    round(grouped.issue_weight_kg, 3),
    round(grouped.return_quantity, 3),
    round(grouped.return_weight_kg, 3),
    round(grouped.waste_quantity, 3),
    round(grouped.waste_weight_kg, 3),
    greatest(round(grouped.issue_quantity - grouped.return_quantity + grouped.waste_quantity, 3), 0),
    greatest(round(grouped.issue_weight_kg - grouped.return_weight_kg + grouped.waste_weight_kg, 3), 0)
  from grouped
  order by grouped.issue_date desc, grouped.product_code, grouped.lot_no;
$$;

create or replace function public.get_production_stock_lot_balances(
  p_department_id uuid,
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
    select
      o.product_code,
      o.lot_no,
      max(o.product_name_snapshot) as product_name,
      sum(o.quantity) as quantity_delta,
      sum(o.weight_kg) as weight_delta
    from public.production_stock_opening_balances o
    where o.department_id = p_department_id
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or o.product_code = any(p_product_codes))
    group by o.product_code, o.lot_no
  ),
  receipt_rows as (
    select
      p.sku_code as product_code,
      l.lot_code as lot_no,
      max(coalesce(c.sku_name, p.sku_code)) as product_name,
      count(r.id)::numeric as quantity_delta,
      sum(r.net_weight_kg) as weight_delta
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id = r.product_config_id
    join public.production_weight_scale_lots l on l.id = r.lot_id
    left join public.products_cache c on c.sku_code = p.sku_code
    where p.department_id = p_department_id
      and r.status = 'recorded'
      and coalesce(r.metadata ->> 'isReturn', 'false') <> 'true'
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or p.sku_code = any(p_product_codes))
    group by p.sku_code, l.lot_code
  ),
  issue_rows as (
    select
      i.product_code,
      i.lot_no,
      max(i.product_name_snapshot) as product_name,
      -sum(i.quantity) as quantity_delta,
      -sum(i.weight_kg) as weight_delta
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i
      on i.issue_document_id = d.id
     and i.status = 'confirmed'
    where d.department_id = p_department_id
      and d.status = 'confirmed'
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or i.product_code = any(p_product_codes))
    group by i.product_code, i.lot_no
  ),
  movement_rows as (
    select
      m.product_code,
      m.lot_no,
      max(m.product_name_snapshot) as product_name,
      sum(case when m.movement_type = 'return_in' then m.quantity_in else -m.quantity_out end) as quantity_delta,
      sum(case when m.movement_type = 'return_in' then m.weight_in_kg else -m.weight_out_kg end) as weight_delta
    from public.production_stock_movements m
    left join public.production_stock_issue_items source_item
      on source_item.id::text = nullif(m.metadata ->> 'sourceIssueItemId', '')
    left join public.production_stock_issue_documents source_document
      on source_document.id = source_item.issue_document_id
    where m.department_id = p_department_id
      and m.movement_type in ('return_in', 'waste_out')
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or m.product_code = any(p_product_codes))
      and (
        nullif(m.metadata ->> 'sourceIssueItemId', '') is null
        or (source_item.status = 'confirmed' and source_document.status = 'confirmed')
      )
    group by m.product_code, m.lot_no
  ),
  grouped as (
    select
      rows.product_code,
      rows.lot_no,
      max(rows.product_name) as product_name,
      sum(rows.quantity_delta) as balance_quantity,
      sum(rows.weight_delta) as balance_weight_kg
    from (
      select * from opening_rows
      union all
      select * from receipt_rows
      union all
      select * from issue_rows
      union all
      select * from movement_rows
    ) rows
    group by rows.product_code, rows.lot_no
  )
  select
    grouped.product_code,
    grouped.product_name,
    grouped.lot_no,
    round(grouped.balance_quantity, 3),
    round(grouped.balance_weight_kg, 3)
  from grouped
  where grouped.balance_quantity > 0 or grouped.balance_weight_kg > 0
  order by grouped.product_code, grouped.lot_no;
$$;

revoke all on function public.get_production_stock_activity_summary(uuid, date, date, text[], text[]) from public;
revoke all on function public.get_production_stock_lot_balances(uuid, text[]) from public;
grant execute on function public.get_production_stock_activity_summary(uuid, date, date, text[], text[]) to service_role;
grant execute on function public.get_production_stock_lot_balances(uuid, text[]) to service_role;
