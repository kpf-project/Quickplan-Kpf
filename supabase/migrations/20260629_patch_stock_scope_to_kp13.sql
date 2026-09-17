do $$
declare
  v_previous_scope text := concat('DEP', '-BIS');
  v_active_scope text := 'KP13';
begin
  execute replace(
    pg_get_functiondef('public.sync_production_weight_receipt_stock_movement()'::regprocedure),
    v_previous_scope,
    v_active_scope
  );

  execute replace(
    pg_get_functiondef('public.create_production_stock_issue(text,text,uuid,text)'::regprocedure),
    v_previous_scope,
    v_active_scope
  );
end;
$$;

insert into public.production_stock_movements (
  movement_no,
  movement_type,
  movement_date,
  movement_at,
  department_id,
  department_code,
  product_code,
  product_name_snapshot,
  category_code,
  lot_no,
  uom_name,
  quantity_in,
  weight_in_kg,
  source_document_type,
  source_document_no,
  reference_type,
  reference_no,
  remark,
  metadata
)
select
  public.generate_production_stock_reference_no('MVRCV'),
  'receipt_in',
  case
    when coalesce(receipts.metadata ->> 'productionDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (receipts.metadata ->> 'productionDate')::date
    else (timezone('Asia/Bangkok', receipts.weighed_at))::date
  end,
  receipts.weighed_at,
  scale_products.department_id,
  departments.code,
  products.sku_code,
  products.sku_name,
  products.iccat_code,
  lots.lot_code,
  products.uom_name,
  1,
  receipts.net_weight_kg,
  'weight_receipt',
  receipts.barcode,
  'weight_receipt',
  receipts.barcode,
  'backfill receipt from weight scale after KP13 scope patch',
  jsonb_build_object(
    'sourceReceiptId', receipts.id,
    'barcode', receipts.barcode,
    'weighedAt', receipts.weighed_at,
    'grossWeightKg', receipts.gross_weight_kg,
    'tareWeightKg', receipts.tare_weight_kg,
    'backfilled', true,
    'scopePatch', 'KP13'
  )
from public.production_weight_receipts receipts
join public.production_weight_scale_products scale_products
  on scale_products.id = receipts.product_config_id
join public.production_weight_scale_lots lots
  on lots.id = receipts.lot_id
join public.products_cache products
  on products.sku_code = scale_products.sku_code
join public.production_departments departments
  on departments.id = scale_products.department_id
where receipts.status = 'recorded'
  and lower(coalesce(receipts.metadata ->> 'isReturn', 'false')) <> 'true'
  and departments.code = 'KP13'
  and products.iccat_code = '03'
  and not exists (
    select 1
    from public.production_stock_movements movements
    where movements.movement_type = 'receipt_in'
      and movements.source_document_type = 'weight_receipt'
      and movements.source_document_no = receipts.barcode
  );
