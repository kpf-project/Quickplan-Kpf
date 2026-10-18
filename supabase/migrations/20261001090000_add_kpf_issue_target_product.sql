alter table public.production_stock_issue_documents
  add column if not exists target_product_code text references public.products_cache(sku_code) on delete restrict,
  add column if not exists target_product_name_snapshot text,
  add column if not exists target_product_category_code text;

alter table public.production_stock_issue_documents
  drop constraint if exists production_stock_issue_documents_target_category_check;
alter table public.production_stock_issue_documents
  add constraint production_stock_issue_documents_target_category_check
  check (
    target_product_category_code is null
    or target_product_category_code in ('03', '04', '04-1', '04-2')
  );

create index if not exists production_stock_issue_documents_target_product_idx
  on public.production_stock_issue_documents (target_product_code, issue_date desc)
  where target_product_code is not null;

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
  documents.restored_at as document_restored_at,
  documents.target_product_code,
  documents.target_product_name_snapshot,
  documents.target_product_category_code
from public.production_stock_issue_documents documents
join public.production_stock_issue_items items
  on items.issue_document_id = documents.id;

create or replace function public.create_production_stock_issue(
  p_barcode text,
  p_issue_type text,
  p_actor_user_id uuid,
  p_remark text,
  p_issue_date date,
  p_target_product_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue_type text := upper(trim(coalesce(p_issue_type, '')));
  v_target_code text := upper(trim(coalesce(p_target_product_code, '')));
  v_target record;
  v_result jsonb;
begin
  if v_issue_type = 'KPF' and v_target_code = '' then
    raise exception using errcode = 'P0001', message = 'กรุณาเลือกสินค้า WIP หรือ FG ปลายทางก่อนเบิก KPF';
  end if;

  if v_issue_type <> 'KPF' and v_target_code <> '' then
    raise exception using errcode = 'P0001', message = 'สินค้าปลายทางใช้ได้เฉพาะการเบิก KPF';
  end if;

  if v_issue_type = 'KPF' then
    select cache.sku_code, cache.sku_name, cache.iccat_code
    into v_target
    from public.production_department_products department_products
    join public.production_departments departments
      on departments.id = department_products.department_id
    join public.products_cache cache
      on cache.sku_code = department_products.sku_code
    where departments.code = 'KP13'
      and departments.is_active = true
      and departments.deleted_at is null
      and upper(cache.sku_code) = v_target_code
      and cache.iccat_code in ('03', '04', '04-1', '04-2')
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'สินค้าปลายทางไม่อยู่ในรายการ WIP/FG ของแผนก KP13';
    end if;
  end if;

  v_result := public.create_production_stock_issue(
    p_barcode,
    p_issue_type,
    p_actor_user_id,
    p_remark,
    p_issue_date
  );

  if v_issue_type = 'KPF' then
    update public.production_stock_issue_documents
    set
      target_product_code = v_target.sku_code,
      target_product_name_snapshot = v_target.sku_name,
      target_product_category_code = v_target.iccat_code,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'targetProductCode', v_target.sku_code,
        'targetProductName', v_target.sku_name,
        'targetProductCategoryCode', v_target.iccat_code
      )
    where id = (v_result ->> 'issueDocumentId')::uuid;

    update public.production_stock_movements
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'targetProductCode', v_target.sku_code,
      'targetProductName', v_target.sku_name,
      'targetProductCategoryCode', v_target.iccat_code
    )
    where source_document_no = v_result ->> 'issueNo'
      and movement_type = 'issue_out';

    v_result := v_result || jsonb_build_object(
      'targetProductCode', v_target.sku_code,
      'targetProductName', v_target.sku_name,
      'targetProductCategoryCode', v_target.iccat_code
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.create_production_stock_issue_batch_atomic(
  p_barcodes text[],
  p_issue_type text,
  p_actor_user_id uuid,
  p_remark text,
  p_issue_date date,
  p_target_product_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode text;
  v_scope_key text;
  v_results jsonb := '[]'::jsonb;
begin
  if coalesce(array_length(p_barcodes, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'กรุณาเลือกรายการที่ต้องการเบิก';
  end if;
  if array_length(p_barcodes, 1) > 100 then
    raise exception using errcode = 'P0001', message = 'เลือกได้ไม่เกิน 100 รายการต่อครั้ง';
  end if;
  if exists (
    select 1 from unnest(p_barcodes) barcode
    group by upper(trim(barcode)) having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'พบบาร์โค้ดซ้ำในรายการที่เลือก';
  end if;

  for v_scope_key in
    select distinct concat_ws('|', products.department_id::text, products.sku_code, lots.lot_code)
    from public.production_weight_receipts receipts
    join public.production_weight_scale_products products on products.id = receipts.product_config_id
    join public.production_weight_scale_lots lots on lots.id = receipts.lot_id
    where upper(receipts.barcode) = any (
      select upper(trim(barcode)) from unnest(p_barcodes) barcode
    )
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));
  end loop;

  foreach v_barcode in array p_barcodes loop
    if nullif(trim(v_barcode), '') is null then
      raise exception using errcode = 'P0001', message = 'พบบาร์โค้ดว่างในรายการที่เลือก';
    end if;
    v_results := v_results || jsonb_build_array(
      public.create_production_stock_issue(
        trim(v_barcode), p_issue_type, p_actor_user_id, p_remark,
        p_issue_date, p_target_product_code
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.create_production_stock_issue(text, text, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.create_production_stock_issue(text, text, uuid, text, date, text)
  to service_role;

revoke all on function public.create_production_stock_issue_batch_atomic(text[], text, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.create_production_stock_issue_batch_atomic(text[], text, uuid, text, date, text)
  to service_role;

create or replace function public.get_production_stock_activity_summary_by_target(
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
  target_product_code text,
  target_product_name text,
  target_product_category_code text,
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
  with activity_rows as (
    select
      documents.issue_date,
      items.lot_no,
      items.product_code,
      items.product_name_snapshot as product_name,
      documents.target_product_code,
      documents.target_product_name_snapshot as target_product_name,
      documents.target_product_category_code,
      items.quantity as issue_quantity,
      items.weight_kg as issue_weight_kg,
      0::numeric as return_quantity,
      0::numeric as return_weight_kg,
      0::numeric as waste_quantity,
      0::numeric as waste_weight_kg
    from public.production_stock_issue_documents documents
    join public.production_stock_issue_items items
      on items.issue_document_id = documents.id
     and items.status = 'confirmed'
    where documents.department_id = p_department_id
      and documents.status = 'confirmed'
      and documents.issue_date between p_date_from and p_date_to
      and (p_issue_types is null or cardinality(p_issue_types) = 0 or documents.issue_type = any(p_issue_types))
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or items.product_code = any(p_product_codes))

    union all

    select
      movements.movement_date,
      movements.lot_no,
      movements.product_code,
      movements.product_name_snapshot,
      source_documents.target_product_code,
      source_documents.target_product_name_snapshot,
      source_documents.target_product_category_code,
      0::numeric,
      0::numeric,
      case when movements.movement_type = 'return_in' then movements.quantity_in else 0 end,
      case when movements.movement_type = 'return_in' then movements.weight_in_kg else 0 end,
      case when movements.movement_type = 'waste_out' then movements.quantity_out else 0 end,
      case when movements.movement_type = 'waste_out' then movements.weight_out_kg else 0 end
    from public.production_stock_movements movements
    left join public.production_stock_issue_items source_items
      on source_items.id::text = nullif(movements.metadata ->> 'sourceIssueItemId', '')
    left join public.production_stock_issue_documents source_documents
      on source_documents.id = source_items.issue_document_id
    where movements.department_id = p_department_id
      and movements.movement_type in ('return_in', 'waste_out')
      and movements.movement_date between p_date_from and p_date_to
      and (p_product_codes is null or cardinality(p_product_codes) = 0 or movements.product_code = any(p_product_codes))
      and (
        nullif(movements.metadata ->> 'sourceIssueItemId', '') is null
        or (source_items.status = 'confirmed' and source_documents.status = 'confirmed')
      )
  ), grouped as (
    select
      issue_date,
      lot_no,
      product_code,
      max(product_name) as product_name,
      target_product_code,
      max(target_product_name) as target_product_name,
      target_product_category_code,
      sum(issue_quantity) as issue_quantity,
      sum(issue_weight_kg) as issue_weight_kg,
      sum(return_quantity) as return_quantity,
      sum(return_weight_kg) as return_weight_kg,
      sum(waste_quantity) as waste_quantity,
      sum(waste_weight_kg) as waste_weight_kg
    from activity_rows
    group by issue_date, lot_no, product_code, target_product_code, target_product_category_code
  )
  select
    issue_date,
    lot_no,
    product_code,
    product_name,
    target_product_code,
    target_product_name,
    target_product_category_code,
    round(issue_quantity, 3),
    round(issue_weight_kg, 3),
    round(return_quantity, 3),
    round(return_weight_kg, 3),
    round(waste_quantity, 3),
    round(waste_weight_kg, 3),
    greatest(round(issue_quantity - return_quantity + waste_quantity, 3), 0),
    greatest(round(issue_weight_kg - return_weight_kg + waste_weight_kg, 3), 0)
  from grouped
  order by issue_date desc, product_code, target_product_code nulls last, lot_no;
$$;

revoke all on function public.get_production_stock_activity_summary_by_target(uuid, date, date, text[], text[])
  from public, anon, authenticated;
grant execute on function public.get_production_stock_activity_summary_by_target(uuid, date, date, text[], text[])
  to service_role;

notify pgrst, 'reload schema';
