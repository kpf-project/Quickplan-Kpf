-- Multi-level BOM explosion RPC + matrix hardening for WIP->WIP.
-- This migration centralizes explosion logic in Postgres for correctness/performance.

create or replace function public.is_bom_matrix_allowed(parent_type text, child_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when parent_type = 'FG' and child_type in ('WIP', 'RAW') then true
    when parent_type = 'WIP' and child_type in ('WIP', 'RAW') then true
    else false
  end
$$;

create or replace function public.validate_bom_matrix_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_iccat text;
  child_iccat text;
  parent_type text;
  child_type text;
  v_parent_sku text;
  has_cycle boolean := false;
  exceeds_depth boolean := false;
  max_depth constant int := 12;
  old_item_id uuid := null;
begin
  if tg_op = 'UPDATE' then
    old_item_id := old.id;
  end if;

  select b.sku_code, p.iccat_code
    into v_parent_sku, parent_iccat
  from public.production_bom_versions v
  join public.production_boms b on b.id = v.bom_id
  join public.products_cache p on p.sku_code = b.sku_code
  where v.id = new.version_id
    and v.deleted_at is null;

  if parent_iccat is null or v_parent_sku is null then
    raise exception 'BOM parent not found for version_id=%', new.version_id;
  end if;

  select p.iccat_code
    into child_iccat
  from public.products_cache p
  where p.sku_code = new.material_sku_code;

  if child_iccat is null then
    raise exception 'BOM child category not found for material_sku_code=%', new.material_sku_code;
  end if;

  parent_type := public.resolve_bom_item_type(parent_iccat);
  child_type := public.resolve_bom_item_type(child_iccat);

  if parent_type = 'UNKNOWN' then
    raise exception 'BOM parent type is UNKNOWN (iccat_code=%)', parent_iccat;
  end if;

  if parent_type = 'RAW' then
    raise exception 'RAW cannot be BOM parent (iccat_code=%)', parent_iccat;
  end if;

  if child_type = 'UNKNOWN' then
    raise exception 'BOM child type is UNKNOWN (iccat_code=%)', child_iccat;
  end if;

  if v_parent_sku = new.material_sku_code then
    raise exception 'BOM self reference is not allowed: % -> %', v_parent_sku, new.material_sku_code;
  end if;

  if not public.is_bom_matrix_allowed(parent_type, child_type) then
    raise exception 'BOM matrix violation: parent_type=% child_type=% material_sku_code=%',
      parent_type, child_type, new.material_sku_code;
  end if;

  with recursive
  approved_edges as (
    select b.sku_code as parent_sku, bi.material_sku_code as child_sku
    from public.production_bom_items bi
    join public.production_bom_versions v on v.id = bi.version_id
    join public.production_boms b on b.id = v.bom_id
    where v.deleted_at is null
      and v.status = 'approved'
  ),
  current_version_edges as (
    select p.parent_sku, bi.material_sku_code as child_sku
    from (select v_parent_sku as parent_sku) p
    join public.production_bom_items bi on bi.version_id = new.version_id
    where old_item_id is null or bi.id <> old_item_id
    union all
    select p.parent_sku, new.material_sku_code
    from (select v_parent_sku as parent_sku) p
  ),
  edges as (
    select parent_sku, child_sku from approved_edges
    union all
    select parent_sku, child_sku from current_version_edges
  ),
  walk_from_child as (
    select
      new.material_sku_code::text as node,
      array[new.material_sku_code::text] as path,
      0 as depth
    union all
    select
      e.child_sku,
      w.path || e.child_sku,
      w.depth + 1
    from walk_from_child w
    join edges e on e.parent_sku = w.node
    where w.depth < 100
      and not (e.child_sku = any(w.path))
  )
  select exists(
    select 1
    from walk_from_child w
    where w.node = v_parent_sku
  )
  into has_cycle;

  if has_cycle then
    raise exception 'BOM cycle detected: adding % -> % creates loop', v_parent_sku, new.material_sku_code;
  end if;

  with recursive
  approved_edges as (
    select b.sku_code as parent_sku, bi.material_sku_code as child_sku
    from public.production_bom_items bi
    join public.production_bom_versions v on v.id = bi.version_id
    join public.production_boms b on b.id = v.bom_id
    where v.deleted_at is null
      and v.status = 'approved'
  ),
  current_version_edges as (
    select p.parent_sku, bi.material_sku_code as child_sku
    from (select v_parent_sku as parent_sku) p
    join public.production_bom_items bi on bi.version_id = new.version_id
    where old_item_id is null or bi.id <> old_item_id
    union all
    select p.parent_sku, new.material_sku_code
    from (select v_parent_sku as parent_sku) p
  ),
  edges as (
    select parent_sku, child_sku from approved_edges
    union all
    select parent_sku, child_sku from current_version_edges
  ),
  walk_from_parent as (
    select
      v_parent_sku::text as node,
      array[v_parent_sku::text] as path,
      0 as depth
    union all
    select
      e.child_sku,
      w.path || e.child_sku,
      w.depth + 1
    from walk_from_parent w
    join edges e on e.parent_sku = w.node
    where w.depth < 100
      and not (e.child_sku = any(w.path))
  )
  select coalesce(max(depth), 0) > max_depth
  into exceeds_depth
  from walk_from_parent;

  if exceeds_depth then
    raise exception 'BOM depth exceeds limit (% levels) for parent_sku=%', max_depth, v_parent_sku;
  end if;

  return new;
end
$$;

create or replace function public.explode_bom_batch(
  p_plan_items jsonb,
  p_max_depth integer default 12
)
returns table (
  plan_id text,
  root_sku_code text,
  material_sku_code text,
  material_name text,
  item_type text,
  required_qty numeric,
  issue_qty numeric,
  uom_name text,
  max_depth integer,
  has_cycle boolean,
  explosion_rows integer
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
  expanded as (
    select
      p.plan_id,
      p.root_sku_code,
      p.root_sku_code as material_sku_code,
      p.planned_qty as required_qty,
      null::text as uom_name,
      0::integer as depth,
      array[p.root_sku_code]::text[] as path,
      false as is_cycle,
      p.preferred_formula_code,
      p.preferred_bom_version_id
    from plan_input p

    union all

    select
      e.plan_id,
      e.root_sku_code,
      child.material_sku_code,
      (e.required_qty * (child.component_qty / child.base_batch))::numeric as required_qty,
      child.uom_name,
      e.depth + 1 as depth,
      e.path || child.material_sku_code,
      child.material_sku_code = any(e.path) as is_cycle,
      e.preferred_formula_code,
      e.preferred_bom_version_id
    from expanded e
    join settings s on true
    join lateral (
      with selected_version as (
        select
          v.id,
          case when coalesce(v.base_batch, 0) > 0 then v.base_batch else 1 end::numeric as base_batch
        from public.production_boms b
        join public.production_bom_versions v
          on v.bom_id = b.id
        where b.sku_code = e.material_sku_code
          and v.status = 'approved'
          and v.deleted_at is null
        order by
          case
            when e.depth = 0 and e.preferred_bom_version_id is not null and v.id = e.preferred_bom_version_id then 0
            when e.depth = 0 and e.preferred_bom_version_id is null and upper(trim(coalesce(v.formula_code, 'DEFAULT'))) = e.preferred_formula_code then 1
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
        sv.base_batch
      from selected_version sv
      join public.production_bom_items bi
        on bi.version_id = sv.id
      where coalesce(bi.qty, 0) > 0
        and nullif(trim(coalesce(bi.material_sku_code, '')), '') is not null
    ) child on true
    where e.depth < s.max_depth
      and not e.is_cycle
  ),
  exploded_materials as (
    select
      e.plan_id,
      e.root_sku_code,
      e.material_sku_code,
      e.required_qty,
      e.uom_name,
      e.depth,
      e.is_cycle
    from expanded e
    where e.depth > 0
  ),
  exploded_with_meta as (
    select
      em.plan_id,
      em.root_sku_code,
      em.material_sku_code,
      coalesce(pc.sku_name, em.material_sku_code) as material_name,
      public.resolve_bom_item_type(pc.iccat_code) as item_type,
      coalesce(nullif(trim(em.uom_name), ''), nullif(trim(pc.uom_name), ''), 'unit') as uom_name,
      em.required_qty,
      em.depth,
      em.is_cycle
    from exploded_materials em
    left join public.products_cache pc
      on pc.sku_code = em.material_sku_code
  ),
  aggregated as (
    select
      ewm.plan_id,
      ewm.root_sku_code,
      ewm.material_sku_code,
      coalesce(max(ewm.material_name), ewm.material_sku_code) as material_name,
      coalesce(max(ewm.item_type), 'UNKNOWN') as item_type,
      coalesce(max(ewm.uom_name), 'unit') as uom_name,
      coalesce(sum(case when not ewm.is_cycle then ewm.required_qty else 0 end), 0)::numeric as total_required_qty,
      coalesce(bool_or(ewm.is_cycle), false) as has_cycle,
      coalesce(max(ewm.depth), 0)::integer as max_depth,
      count(*) filter (where not ewm.is_cycle)::integer as explosion_rows
    from exploded_with_meta ewm
    group by
      ewm.plan_id,
      ewm.root_sku_code,
      ewm.material_sku_code
  )
  select
    a.plan_id,
    a.root_sku_code,
    a.material_sku_code,
    a.material_name,
    a.item_type,
    a.total_required_qty as required_qty,
    case
      when a.total_required_qty > 0 then ceil(a.total_required_qty)
      else 0::numeric
    end as issue_qty,
    a.uom_name,
    a.max_depth,
    a.has_cycle,
    a.explosion_rows
  from aggregated a
  where a.total_required_qty > 0
     or a.has_cycle
  order by
    a.plan_id,
    a.root_sku_code,
    a.material_sku_code;
$$;

revoke all on function public.explode_bom_batch(jsonb, integer) from public;
grant execute on function public.explode_bom_batch(jsonb, integer) to authenticated;
grant execute on function public.explode_bom_batch(jsonb, integer) to service_role;

comment on function public.explode_bom_batch(jsonb, integer)
is 'Recursive BOM explosion (FG/WIP/WIP.../RAW) with depth+cycle guard for planning and requisition flows.';
