create or replace function public.sync_production_weight_receipt_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_lot record;
  v_department record;
  v_movement_date date;
  v_is_return boolean;
begin
  v_is_return := lower(coalesce(new.metadata ->> 'isReturn', 'false')) = 'true';

  if v_is_return then
    return new;
  end if;

  select
    products.sku_code as product_code,
    products.sku_name as product_name,
    products.uom_name,
    products.iccat_code as category_code,
    scale_products.department_id
  into v_product
  from public.production_weight_scale_products scale_products
  join public.products_cache products
    on products.sku_code = scale_products.sku_code
  where scale_products.id = new.product_config_id
  limit 1;

  if not found then
    return new;
  end if;

  select code
  into v_department
  from public.production_departments
  where id = v_product.department_id
  limit 1;

  if not found then
    return new;
  end if;

  if v_department.code <> 'DEP-BIS' or coalesce(v_product.category_code, '') <> '03' then
    return new;
  end if;

  select lot_code
  into v_lot
  from public.production_weight_scale_lots
  where id = new.lot_id
  limit 1;

  if not found then
    return new;
  end if;

  if coalesce(new.metadata ->> 'productionDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_movement_date := (new.metadata ->> 'productionDate')::date;
  else
    v_movement_date := (timezone('Asia/Bangkok', new.weighed_at))::date;
  end if;

  if tg_op = 'INSERT' and new.status = 'recorded' then
    if not exists (
      select 1
      from public.production_stock_movements movements
      where movements.movement_type = 'receipt_in'
        and movements.source_document_type = 'weight_receipt'
        and movements.source_document_no = new.barcode
    ) then
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
      values (
        public.generate_production_stock_reference_no('MVRCV'),
        'receipt_in',
        v_movement_date,
        new.weighed_at,
        v_product.department_id,
        v_department.code,
        v_product.product_code,
        v_product.product_name,
        v_product.category_code,
        v_lot.lot_code,
        v_product.uom_name,
        1,
        new.net_weight_kg,
        'weight_receipt',
        new.barcode,
        'weight_receipt',
        new.barcode,
        'auto receipt from weight scale',
        jsonb_build_object(
          'sourceReceiptId', new.id,
          'barcode', new.barcode,
          'weighedAt', new.weighed_at,
          'grossWeightKg', new.gross_weight_kg,
          'tareWeightKg', new.tare_weight_kg
        )
      );
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'recorded' and new.status <> 'recorded' then
      if not exists (
        select 1
        from public.production_stock_movements movements
        where movements.movement_type = 'adjustment_out'
          and movements.source_document_type = 'weight_receipt_void'
          and movements.source_document_no = new.barcode
      ) then
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
          quantity_out,
          weight_out_kg,
          source_document_type,
          source_document_no,
          reference_type,
          reference_no,
          remark,
          metadata
        )
        values (
          public.generate_production_stock_reference_no('MVVOID'),
          'adjustment_out',
          (timezone('Asia/Bangkok', now()))::date,
          timezone('utc', now()),
          v_product.department_id,
          v_department.code,
          v_product.product_code,
          v_product.product_name,
          v_product.category_code,
          v_lot.lot_code,
          v_product.uom_name,
          1,
          new.net_weight_kg,
          'weight_receipt_void',
          new.barcode,
          'weight_receipt',
          new.barcode,
          'reverse voided weight receipt',
          jsonb_build_object(
            'sourceReceiptId', new.id,
            'barcode', new.barcode,
            'reversedMovementType', 'receipt_in',
            'voidedAt', coalesce(new.metadata ->> 'voidedAt', null)
          )
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists production_weight_receipts_sync_stock_movement
  on public.production_weight_receipts;

create trigger production_weight_receipts_sync_stock_movement
  after insert or update of status
  on public.production_weight_receipts
  for each row
  execute function public.sync_production_weight_receipt_stock_movement();

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
  'backfill receipt from weight scale',
  jsonb_build_object(
    'sourceReceiptId', receipts.id,
    'barcode', receipts.barcode,
    'weighedAt', receipts.weighed_at,
    'grossWeightKg', receipts.gross_weight_kg,
    'tareWeightKg', receipts.tare_weight_kg,
    'backfilled', true
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
  and departments.code = 'DEP-BIS'
  and products.iccat_code = '03'
  and not exists (
    select 1
    from public.production_stock_movements movements
    where movements.movement_type = 'receipt_in'
      and movements.source_document_type = 'weight_receipt'
      and movements.source_document_no = receipts.barcode
  );
