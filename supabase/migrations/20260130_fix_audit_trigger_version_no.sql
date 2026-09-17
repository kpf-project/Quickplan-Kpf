create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_row jsonb := null;
  old_row jsonb := null;
  actor_id uuid := null;
  action text := null;
  target_id uuid := null;
  metadata jsonb := '{}'::jsonb;
  bom_sku text := null;
  version_no integer := null;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new_row := to_jsonb(new);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    old_row := to_jsonb(old);
  end if;

  actor_id := coalesce(
    private.safe_uuid(new_row->>'updated_by'),
    private.safe_uuid(new_row->>'created_by'),
    private.safe_uuid(new_row->>'deleted_by'),
    private.safe_uuid(new_row->>'requested_by'),
    private.safe_uuid(new_row->>'decided_by'),
    private.safe_uuid(old_row->>'updated_by'),
    private.safe_uuid(old_row->>'created_by'),
    private.safe_uuid(old_row->>'deleted_by'),
    private.safe_uuid(old_row->>'requested_by'),
    private.safe_uuid(old_row->>'decided_by'),
    auth.uid()
  );

  if tg_table_name = 'production_boms' then
    action := case tg_op
      when 'INSERT' then 'bom.create'
      when 'UPDATE' then 'bom.update'
      else 'bom.delete'
    end;
    target_id := coalesce(private.safe_uuid(new_row->>'id'), private.safe_uuid(old_row->>'id'));
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'sku_code', coalesce(new_row->>'sku_code', old_row->>'sku_code'),
      'status_from', old_row->>'status',
      'status_to', new_row->>'status'
    ));
  elsif tg_table_name = 'production_bom_versions' then
    action := case tg_op
      when 'INSERT' then 'bom.version.create'
      when 'UPDATE' then 'bom.version.update'
      else 'bom.version.delete'
    end;
    target_id := coalesce(private.safe_uuid(new_row->>'id'), private.safe_uuid(old_row->>'id'));
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'bom_id', coalesce(new_row->>'bom_id', old_row->>'bom_id'),
      'version_no', coalesce(new_row->>'version_no', old_row->>'version_no'),
      'status_from', old_row->>'status',
      'status_to', new_row->>'status'
    ));
  elsif tg_table_name = 'production_bom_items' then
    action := case tg_op
      when 'INSERT' then 'bom.item.create'
      when 'UPDATE' then 'bom.item.update'
      else 'bom.item.delete'
    end;
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'version_id', coalesce(new_row->>'version_id', old_row->>'version_id'),
      'material_sku_code', coalesce(new_row->>'material_sku_code', old_row->>'material_sku_code'),
      'qty_from', old_row->>'qty',
      'qty_to', new_row->>'qty',
      'uom_name', coalesce(new_row->>'uom_name', old_row->>'uom_name')
    ));
  elsif tg_table_name = 'production_bom_approvals' then
    if tg_op = 'INSERT' then
      action := 'bom.approval.request';
    elsif tg_op = 'UPDATE' and new_row->>'status' is distinct from old_row->>'status' then
      if new_row->>'status' = 'approved' then
        action := 'bom.approval.approve';
      elsif new_row->>'status' = 'rejected' then
        action := 'bom.approval.reject';
      else
        action := 'bom.approval.update';
      end if;
    else
      action := 'bom.approval.delete';
    end if;

    select sku_code into bom_sku
    from public.production_boms
    where id = private.safe_uuid(coalesce(new_row->>'bom_id', old_row->>'bom_id'));

    select v.version_no into version_no
    from public.production_bom_versions v
    where v.id = private.safe_uuid(coalesce(new_row->>'version_id', old_row->>'version_id'));

    metadata := jsonb_strip_nulls(jsonb_build_object(
      'bom_id', coalesce(new_row->>'bom_id', old_row->>'bom_id'),
      'version_id', coalesce(new_row->>'version_id', old_row->>'version_id'),
      'sku_code', bom_sku,
      'version_no', version_no,
      'status_from', old_row->>'status',
      'status_to', new_row->>'status',
      'reason', coalesce(new_row->>'reason', old_row->>'reason'),
      'token_id', coalesce(new_row->>'token_id', old_row->>'token_id')
    ));
  elsif tg_table_name = 'production_plan_status' then
    action := case tg_op
      when 'INSERT' then 'production-plan.create'
      when 'UPDATE' then 'production-plan.update'
      else 'production-plan.delete'
    end;
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'plan_id', coalesce(new_row->>'plan_id', old_row->>'plan_id'),
      'sku_code', coalesce(new_row->>'sku_code', old_row->>'sku_code'),
      'status', coalesce(new_row->>'status', old_row->>'status'),
      'plan_kind', coalesce(new_row->>'plan_kind', old_row->>'plan_kind'),
      'plan_group_id', coalesce(new_row->>'plan_group_id', old_row->>'plan_group_id'),
      'period_start', coalesce(new_row->>'period_start', old_row->>'period_start'),
      'period_end', coalesce(new_row->>'period_end', old_row->>'period_end'),
      'planned_qty', coalesce(new_row->>'planned_qty', old_row->>'planned_qty')
    ));
  elsif tg_table_name = 'production_categories' then
    action := case tg_op
      when 'INSERT' then 'production-category.create'
      when 'UPDATE' then 'production-category.update'
      else 'production-category.delete'
    end;
    target_id := coalesce(private.safe_uuid(new_row->>'id'), private.safe_uuid(old_row->>'id'));
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'code', coalesce(new_row->>'code', old_row->>'code'),
      'name', coalesce(new_row->>'name', old_row->>'name'),
      'is_active', coalesce(new_row->>'is_active', old_row->>'is_active')
    ));
  elsif tg_table_name = 'production_category_products' then
    action := case tg_op
      when 'INSERT' then 'production-category-product.create'
      when 'UPDATE' then 'production-category-product.update'
      else 'production-category-product.delete'
    end;
    metadata := jsonb_strip_nulls(jsonb_build_object(
      'category_id', coalesce(new_row->>'category_id', old_row->>'category_id'),
      'sku_code', coalesce(new_row->>'sku_code', old_row->>'sku_code')
    ));
  else
    return null;
  end if;

  perform private.audit_log_write(actor_id, action, tg_table_name, target_id, metadata);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
