-- Keep custom issue dates and the issue movement in one transaction, and
-- serialize issues for the same department/product/LOT before validating balance.
alter function public.create_production_stock_issue(text, text, uuid, text)
  rename to create_production_stock_issue_core;

create or replace function public.create_production_stock_issue(
  p_barcode text,
  p_issue_type text,
  p_actor_user_id uuid,
  p_remark text,
  p_issue_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_result jsonb;
  v_effective_date date;
  v_lot_balance_weight_kg numeric(14,3);
  v_issue_weight_kg numeric(14,3);
begin
  select
    products.department_id,
    products.sku_code product_code,
    cache.iccat_code category_code,
    lots.lot_code lot_no
  into v_scope
  from public.production_weight_receipts receipts
  join public.production_weight_scale_products products on products.id=receipts.product_config_id
  join public.production_weight_scale_lots lots on lots.id=receipts.lot_id
  join public.products_cache cache on cache.sku_code=products.sku_code
  join public.production_departments departments on departments.id=products.department_id
  where upper(coalesce(receipts.barcode,''))=upper(trim(coalesce(p_barcode,'')))
    and receipts.status='recorded' and departments.code='KP13' and cache.iccat_code='03'
  limit 1;

  if not found then
    raise exception using errcode='P0001',
      message='ไม่พบบาร์โค้ดสำหรับเบิก หรือบาร์โค้ดนี้อยู่นอกขอบเขต KP13 / หมวด 03';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',
    v_scope.department_id::text,v_scope.product_code,v_scope.lot_no),0));

  v_result := public.create_production_stock_issue_core(
    p_barcode,p_issue_type,p_actor_user_id,p_remark
  );
  v_effective_date := coalesce(p_issue_date,nullif(v_result->>'issueDate','')::date);
  v_issue_weight_kg := round(coalesce((v_result->>'weightKg')::numeric,0),3);

  if p_issue_date is not null then
    update public.production_stock_issue_documents
    set issue_date=v_effective_date
    where id=(v_result->>'issueDocumentId')::uuid;

    update public.production_stock_movements
    set movement_date=v_effective_date
    where source_document_no=v_result->>'issueNo' and movement_type='issue_out';

    v_result := jsonb_set(v_result,'{issueDate}',to_jsonb(v_effective_date::text));
  end if;

  select round(
    coalesce((select sum(opening.weight_kg)
      from public.production_stock_opening_balances opening
      where opening.department_id=v_scope.department_id
        and opening.category_code=v_scope.category_code
        and upper(opening.product_code)=upper(v_scope.product_code)
        and coalesce(opening.lot_no,'-')=coalesce(v_scope.lot_no,'-')),0)
    + coalesce((select sum(receipts.net_weight_kg)
      from public.production_weight_receipts receipts
      join public.production_weight_scale_products products on products.id=receipts.product_config_id
      join public.production_weight_scale_lots lots on lots.id=receipts.lot_id
      where products.department_id=v_scope.department_id
        and upper(products.sku_code)=upper(v_scope.product_code)
        and coalesce(lots.lot_code,'-')=coalesce(v_scope.lot_no,'-')
        and receipts.status='recorded'
        and lower(coalesce(receipts.metadata->>'isReturn','false')) not in ('true','1','yes')
        and case
          when coalesce(receipts.metadata->>'productionDate','') ~ '^\d{4}-\d{2}-\d{2}$'
            then (receipts.metadata->>'productionDate')::date
          else timezone('Asia/Bangkok',receipts.weighed_at)::date
        end <= v_effective_date),0)
    - coalesce((select sum(items.weight_kg)
      from public.production_stock_issue_items items
      join public.production_stock_issue_documents documents on documents.id=items.issue_document_id
      where documents.department_id=v_scope.department_id
        and upper(items.product_code)=upper(v_scope.product_code)
        and coalesce(items.lot_no,'-')=coalesce(v_scope.lot_no,'-')
        and items.status='confirmed' and documents.status='confirmed'
        and documents.issue_date<=v_effective_date),0)
    + coalesce((select sum(movements.weight_in_kg)
      from public.production_stock_movements movements
      left join public.production_stock_issue_items source_items
        on source_items.id::text=movements.metadata->>'sourceIssueItemId'
      left join public.production_stock_issue_documents source_documents
        on source_documents.id=source_items.issue_document_id
      where movements.department_id=v_scope.department_id
        and upper(movements.product_code)=upper(v_scope.product_code)
        and coalesce(movements.lot_no,'-')=coalesce(v_scope.lot_no,'-')
        and movements.movement_type='return_in' and movements.movement_date<=v_effective_date
        and (source_items.id is null or
          (source_items.status='confirmed' and source_documents.status='confirmed'))),0)
    - coalesce((select sum(movements.weight_out_kg)
      from public.production_stock_movements movements
      left join public.production_stock_issue_items source_items
        on source_items.id::text=movements.metadata->>'sourceIssueItemId'
      left join public.production_stock_issue_documents source_documents
        on source_documents.id=source_items.issue_document_id
      where movements.department_id=v_scope.department_id
        and upper(movements.product_code)=upper(v_scope.product_code)
        and coalesce(movements.lot_no,'-')=coalesce(v_scope.lot_no,'-')
        and movements.movement_type='waste_out' and movements.movement_date<=v_effective_date
        and (source_items.id is null or
          (source_items.status='confirmed' and source_documents.status='confirmed'))),0)
  ,3) into v_lot_balance_weight_kg;

  if v_lot_balance_weight_kg < 0 then
    raise exception using errcode='P0001', message=format(
      'LOT %s คงเหลือไม่พอ ณ วันที่ %s (คงเหลือ %s Kg, ต้องการเบิก %s Kg)',
      v_scope.lot_no,v_effective_date,
      round(v_lot_balance_weight_kg+v_issue_weight_kg,3),v_issue_weight_kg
    );
  end if;

  return v_result;
end;
$$;

-- Compatibility entry point keeps already-running app instances guarded too.
create or replace function public.create_production_stock_issue(
  p_barcode text,
  p_issue_type text,
  p_actor_user_id uuid default null,
  p_remark text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_production_stock_issue(
    p_barcode,p_issue_type,p_actor_user_id,p_remark,null::date
  );
$$;

revoke all on function public.create_production_stock_issue_core(text, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_production_stock_issue(text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_production_stock_issue(text, text, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.create_production_stock_issue(text, text, uuid, text)
  to service_role;
grant execute on function public.create_production_stock_issue(text, text, uuid, text, date)
  to service_role;

notify pgrst, 'reload schema';
