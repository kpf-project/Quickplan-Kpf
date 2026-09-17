alter table public.production_stock_issue_documents
  add column if not exists restored_at timestamptz;
alter table public.production_stock_issue_items
  add column if not exists restored_at timestamptz;
alter table public.production_weight_receipts
  add column if not exists restored_at timestamptz;

create or replace function public.track_stock_status_restoration()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'voided' and new.status in ('confirmed', 'recorded') then
    new.restored_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists production_stock_issue_documents_track_restore
  on public.production_stock_issue_documents;
create trigger production_stock_issue_documents_track_restore
  before update of status on public.production_stock_issue_documents
  for each row execute function public.track_stock_status_restoration();

drop trigger if exists production_stock_issue_items_track_restore
  on public.production_stock_issue_items;
create trigger production_stock_issue_items_track_restore
  before update of status on public.production_stock_issue_items
  for each row execute function public.track_stock_status_restoration();

drop trigger if exists production_weight_receipts_track_restore
  on public.production_weight_receipts;
create trigger production_weight_receipts_track_restore
  before update of status on public.production_weight_receipts
  for each row execute function public.track_stock_status_restoration();

with restored_sources as (
  select
    (metadata #>> '{historicalCorrection20260907,sourceIssueItemId}')::uuid as source_item_id,
    min(voided_at) as restored_at
  from public.production_stock_issue_items
  where metadata #>> '{historicalCorrection20260907,action}' = 'void_duplicate_original_barcode_issue'
    and metadata #>> '{historicalCorrection20260907,sourceIssueItemId}' is not null
    and voided_at is not null
  group by (metadata #>> '{historicalCorrection20260907,sourceIssueItemId}')::uuid
)
update public.production_stock_issue_items source
set restored_at = restored_sources.restored_at
from restored_sources
where source.id = restored_sources.source_item_id
  and source.metadata #>> '{historicalCorrection20260907,action}' = 'restore_source_issue'
  and source.restored_at is null;

with restored_sources as (
  select source.id as source_item_id, min(duplicate.voided_at) as restored_at
  from public.production_stock_issue_items duplicate
  join public.production_stock_issue_items source
    on source.source_receipt_id = duplicate.source_receipt_id
   and source.metadata #>> '{historicalReturnChainRepair20260907,action}' = 'restore_source_issue'
  where duplicate.metadata #>> '{historicalReturnChainRepair20260907,action}' = 'void_duplicate_root_issue'
    and duplicate.voided_at is not null
  group by source.id
)
update public.production_stock_issue_items source
set restored_at = restored_sources.restored_at
from restored_sources
where source.id = restored_sources.source_item_id
  and source.restored_at is null;

update public.production_stock_issue_documents documents
set restored_at = restored.restored_at
from (
  select issue_document_id, min(restored_at) as restored_at
  from public.production_stock_issue_items
  where restored_at is not null
  group by issue_document_id
) restored
where documents.id = restored.issue_document_id
  and documents.metadata #>> '{historicalCorrection20260907,action}' = 'restore_source_issue'
  and documents.restored_at is null;

create or replace view public.production_stock_issue_report_lines_v
with (security_invoker = true) as
select
  documents.id as issue_document_id,
  items.id as issue_item_id,
  documents.issue_no,
  documents.department_id,
  documents.department_code,
  documents.issue_type,
  documents.issue_date,
  documents.issued_at as document_issued_at,
  documents.status as document_status,
  documents.remark as document_remark,
  items.source_receipt_id,
  items.barcode,
  items.product_code,
  items.product_name_snapshot,
  items.category_code,
  items.lot_no,
  items.uom_name,
  items.quantity,
  items.weight_kg,
  items.issued_at,
  items.status as item_status,
  items.voided_at,
  items.void_reason,
  items.created_at,
  documents.voided_at as document_voided_at,
  items.restored_at as item_restored_at,
  documents.restored_at as document_restored_at
from public.production_stock_issue_documents documents
join public.production_stock_issue_items items
  on items.issue_document_id = documents.id;

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
    select o.product_code, o.lot_no, max(o.product_name_snapshot) as product_name,
           sum(o.quantity) as quantity_delta, sum(o.weight_kg) as weight_delta
    from public.production_stock_opening_balances o
    where o.department_id = p_department_id
      and o.category_code = p_category_code
      and o.balance_date < p_date_from
      and o.created_at <= p_as_of_cutoff
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or o.product_code = any(p_product_codes))
    group by o.product_code, o.lot_no
  ), receipt_rows as (
    select p.sku_code as product_code, l.lot_code as lot_no,
           max(coalesce(c.sku_name, p.sku_code)) as product_name,
           count(r.id)::numeric as quantity_delta, sum(r.net_weight_kg) as weight_delta
    from public.production_weight_receipts r
    join public.production_weight_scale_products p on p.id = r.product_config_id
    join public.production_weight_scale_lots l on l.id = r.lot_id
    left join public.products_cache c on c.sku_code = p.sku_code
    where p.department_id = p_department_id
      and timezone('Asia/Bangkok', r.weighed_at)::date < p_date_from
      and r.created_at <= p_as_of_cutoff
      and (r.restored_at is null or r.restored_at <= p_as_of_cutoff)
      and coalesce(r.metadata ->> 'isReturn', 'false') <> 'true'
      and (
        r.status = 'recorded'
        or (
          r.status = 'voided'
          and coalesce(r.metadata ->> 'voidedAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
          and (r.metadata ->> 'voidedAt')::timestamptz > p_as_of_cutoff
        )
      )
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or p.sku_code = any(p_product_codes))
    group by p.sku_code, l.lot_code
  ), active_issues as (
    select i.id, i.product_code, i.lot_no, max(i.product_name_snapshot) over (partition by i.product_code, i.lot_no) as product_name,
           i.quantity, i.weight_kg
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i on i.issue_document_id = d.id
    where d.department_id = p_department_id
      and i.category_code = p_category_code
      and d.issue_date < p_date_from
      and d.issued_at <= p_as_of_cutoff
      and i.created_at <= p_as_of_cutoff
      and (d.restored_at is null or d.restored_at <= p_as_of_cutoff)
      and (i.restored_at is null or i.restored_at <= p_as_of_cutoff)
      and (d.status = 'confirmed' or (d.status = 'voided' and d.voided_at > p_as_of_cutoff))
      and (i.status = 'confirmed' or (i.status = 'voided' and i.voided_at > p_as_of_cutoff))
      and (p_issue_types is null or cardinality(p_issue_types) = 0 or d.issue_type = any(p_issue_types))
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or i.product_code = any(p_product_codes))
  ), issue_rows as (
    select product_code, lot_no, max(product_name) as product_name,
           -sum(quantity) as quantity_delta, -sum(weight_kg) as weight_delta
    from active_issues
    group by product_code, lot_no
  ), movement_rows as (
    select m.product_code, m.lot_no, max(m.product_name_snapshot) as product_name,
           sum(case when m.movement_type = 'return_in' then m.quantity_in else -m.quantity_out end) as quantity_delta,
           sum(case when m.movement_type = 'return_in' then m.weight_in_kg else -m.weight_out_kg end) as weight_delta
    from public.production_stock_movements m
    left join active_issues source on source.id::text = nullif(m.metadata ->> 'sourceIssueItemId', '')
    where m.department_id = p_department_id
      and m.category_code = p_category_code
      and m.movement_type in ('return_in', 'waste_out')
      and m.movement_date < p_date_from
      and m.movement_at <= p_as_of_cutoff
      and (nullif(m.metadata ->> 'sourceIssueItemId', '') is null or source.id is not null)
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or m.product_code = any(p_product_codes))
    group by m.product_code, m.lot_no
  ), grouped as (
    select rows.product_code, rows.lot_no, max(rows.product_name) as product_name,
           sum(rows.quantity_delta) as balance_quantity,
           sum(rows.weight_delta) as balance_weight_kg
    from (
      select * from opening_rows
      union all select * from receipt_rows
      union all select * from issue_rows
      union all select * from movement_rows
    ) rows
    group by rows.product_code, rows.lot_no
  )
  select grouped.product_code, grouped.product_name, grouped.lot_no,
         round(grouped.balance_quantity, 3), round(grouped.balance_weight_kg, 3)
  from grouped;
$$;

revoke all on function public.track_stock_status_restoration()
  from public, anon, authenticated;
revoke all on function public.get_production_stock_opening_as_of(uuid, text, date, timestamptz, text[], text[])
  from public, anon, authenticated;
grant execute on function public.get_production_stock_opening_as_of(uuid, text, date, timestamptz, text[], text[])
  to service_role;

notify pgrst, 'reload schema';
