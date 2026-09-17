-- QA-focused recursive BOM trace RPC.
-- Returns per-level parent->child expansion rows with equation inputs.

create or replace function public.explode_bom_trace_batch(
  p_plan_items jsonb,
  p_max_depth integer default 12
)
returns table (
  plan_id text,
  root_sku_code text,
  depth integer,
  parent_sku_code text,
  parent_material_name text,
  parent_required_qty numeric,
  child_sku_code text,
  child_material_name text,
  child_item_type text,
  child_required_qty numeric,
  component_qty numeric,
  base_batch numeric,
  uom_name text,
  bom_version_id uuid,
  bom_version_no integer,
  formula_code text,
  formula_name text,
  path text[],
  is_cycle boolean
)
language sql
stable
set search_path = ''
as $$
  with recursive
  settings as (
    select least(greatest(coalesce(p_max_depth, 12), 1), 30)::integer as max_depth
  ),
  raw_input as (
    select
      coalesce(nullif(trim(x.plan_id), ''), concat('PLAN-', row_number() over ())) as plan_id,
      upper(trim(coalesce(x.sku_code, ''))) as root_sku_code,
      coalesce(x.planned_qty, 0)::numeric as planned_qty,
      upper(trim(coalesce(nullif(x.formula_code, ''), 'DEFAULT'))) as preferred_formula_code,
      x.bom_version_id as preferred_bom_version_id
    from jsonb_to_recordset(coalesce(p_plan_items, '[]'::jsonb))
      as x(plan_id text, sku_code text, planned_qty numeric, formula_code text, bom_version_id uuid)
  ),
  plan_input as (
    select
      r.plan_id,
      r.root_sku_code,
      r.planned_qty,
      r.preferred_formula_code,
      r.preferred_bom_version_id
    from raw_input r
    where r.root_sku_code <> ''
      and r.planned_qty > 0
  ),
  walk as (
    select
      p.plan_id,
      p.root_sku_code,
      0::integer as depth,
      p.root_sku_code as current_sku_code,
      p.planned_qty as current_required_qty,
      array[p.root_sku_code]::text[] as path,
      false as is_cycle,
      null::text as parent_sku_code,
      null::numeric as parent_required_qty,
      null::numeric as component_qty,
      null::numeric as base_batch,
      null::text as uom_name,
      null::uuid as bom_version_id,
      null::integer as bom_version_no,
      null::text as formula_code,
      null::text as formula_name,
      p.preferred_formula_code,
      p.preferred_bom_version_id
    from plan_input p

    union all

    select
      w.plan_id,
      w.root_sku_code,
      w.depth + 1 as depth,
      child.material_sku_code as current_sku_code,
      (w.current_required_qty * (child.component_qty / child.base_batch))::numeric as current_required_qty,
      w.path || child.material_sku_code,
      child.material_sku_code = any(w.path) as is_cycle,
      w.current_sku_code as parent_sku_code,
      w.current_required_qty as parent_required_qty,
      child.component_qty,
      child.base_batch,
      child.uom_name,
      child.version_id as bom_version_id,
      child.version_no as bom_version_no,
      child.version_formula_code as formula_code,
      child.version_formula_name as formula_name,
      w.preferred_formula_code,
      w.preferred_bom_version_id
    from walk w
    join settings s on true
    join lateral (
      with selected_version as (
        select
          v.id as version_id,
          coalesce(v.version_no, 0)::integer as version_no,
          upper(trim(coalesce(v.formula_code, 'DEFAULT'))) as version_formula_code,
          coalesce(nullif(trim(v.formula_name), ''), 'สูตรหลัก') as version_formula_name,
          case when coalesce(v.base_batch, 0) > 0 then v.base_batch else 1 end::numeric as base_batch
        from public.production_boms b
        join public.production_bom_versions v
          on v.bom_id = b.id
        where b.sku_code = w.current_sku_code
          and v.status = 'approved'
          and v.deleted_at is null
        order by
          case
            when w.depth = 0 and w.preferred_bom_version_id is not null and v.id = w.preferred_bom_version_id then 0
            when w.depth = 0 and w.preferred_bom_version_id is null and upper(trim(coalesce(v.formula_code, 'DEFAULT'))) = w.preferred_formula_code then 1
            when upper(trim(coalesce(v.formula_code, 'DEFAULT'))) = 'DEFAULT' then 2
            else 3
          end,
          v.version_no desc
        limit 1
      )
      select
        upper(trim(coalesce(bi.material_sku_code, ''))) as material_sku_code,
        coalesce(bi.qty, 0)::numeric as component_qty,
        nullif(trim(coalesce(bi.uom_name, '')), '') as uom_name,
        sv.base_batch,
        sv.version_id,
        sv.version_no,
        sv.version_formula_code,
        sv.version_formula_name
      from selected_version sv
      join public.production_bom_items bi
        on bi.version_id = sv.version_id
      where coalesce(bi.qty, 0) > 0
        and nullif(trim(coalesce(bi.material_sku_code, '')), '') is not null
    ) child on true
    where w.depth < s.max_depth
      and not w.is_cycle
  ),
  edge_rows as (
    select
      w.plan_id,
      w.root_sku_code,
      w.depth,
      w.parent_sku_code,
      w.parent_required_qty,
      w.current_sku_code as child_sku_code,
      w.current_required_qty as child_required_qty,
      w.component_qty,
      w.base_batch,
      coalesce(w.uom_name, 'unit') as uom_name,
      w.bom_version_id,
      w.bom_version_no,
      coalesce(w.formula_code, 'DEFAULT') as formula_code,
      coalesce(w.formula_name, 'สูตรหลัก') as formula_name,
      w.path,
      w.is_cycle
    from walk w
    where w.depth > 0
  )
  select
    e.plan_id,
    e.root_sku_code,
    e.depth,
    e.parent_sku_code,
    coalesce(pp.sku_name, e.parent_sku_code) as parent_material_name,
    e.parent_required_qty,
    e.child_sku_code,
    coalesce(pc.sku_name, e.child_sku_code) as child_material_name,
    coalesce(public.resolve_bom_item_type(pc.iccat_code), 'UNKNOWN') as child_item_type,
    e.child_required_qty,
    e.component_qty,
    e.base_batch,
    e.uom_name,
    e.bom_version_id,
    e.bom_version_no,
    e.formula_code,
    e.formula_name,
    e.path,
    e.is_cycle
  from edge_rows e
  left join public.products_cache pp
    on pp.sku_code = e.parent_sku_code
  left join public.products_cache pc
    on pc.sku_code = e.child_sku_code
  order by
    e.plan_id,
    e.depth,
    e.parent_sku_code,
    e.child_sku_code;
$$;

revoke all on function public.explode_bom_trace_batch(jsonb, integer) from public;
grant execute on function public.explode_bom_trace_batch(jsonb, integer) to authenticated;
grant execute on function public.explode_bom_trace_batch(jsonb, integer) to service_role;

comment on function public.explode_bom_trace_batch(jsonb, integer)
is 'Recursive BOM trace rows per level for QA/debug: parent->child equation terms, version/formula selection, path and cycle flags.';
