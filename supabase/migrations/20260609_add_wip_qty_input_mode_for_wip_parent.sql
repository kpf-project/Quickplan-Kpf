-- Add WIP input mode to BOM versions and align explosion scale rules:
-- - FG parent: component qty is defined per base_output_boxes (FG units)
-- - WIP parent: can be defined by mode
--   - batch => scale by base_batch
--   - unit  => scale by base_output_boxes
-- Legacy fallback for WIP remains base_batch/base_output_boxes/1.

alter table public.production_bom_versions
  add column if not exists wip_qty_input_mode text;

alter table public.production_bom_versions
  alter column wip_qty_input_mode set default 'unit';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_versions_wip_qty_input_mode_check'
  ) then
    alter table public.production_bom_versions
      add constraint production_bom_versions_wip_qty_input_mode_check
      check (
        wip_qty_input_mode is null
        or lower(trim(wip_qty_input_mode)) in ('unit', 'batch')
      );
  end if;
end $$;

-- Backfill legacy versions:
-- - Existing WIP BOM versions default to batch semantics.
-- - Remaining null rows (e.g. FG) default to unit semantics.
update public.production_bom_versions v
set wip_qty_input_mode = 'batch'
from public.production_boms b
left join public.products_cache p
  on p.sku_code = b.sku_code
where v.bom_id = b.id
  and (v.wip_qty_input_mode is null or trim(v.wip_qty_input_mode) = '')
  and public.resolve_bom_item_type(p.iccat_code) = 'WIP';

update public.production_bom_versions
set wip_qty_input_mode = 'unit'
where wip_qty_input_mode is null or trim(wip_qty_input_mode) = '';

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
      (e.required_qty * (child.component_qty / child.scale_base_qty))::numeric as required_qty,
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
          case
            when public.resolve_bom_item_type(pp.iccat_code) = 'WIP'
              then case
                when lower(trim(coalesce(v.wip_qty_input_mode, 'batch'))) = 'unit'
                  then case
                    when coalesce(v.base_output_boxes, 0) > 0 then v.base_output_boxes
                    when coalesce(v.base_batch, 0) > 0 then v.base_batch
                    else 1
                  end
                else case
                  when coalesce(v.base_batch, 0) > 0 then v.base_batch
                  when coalesce(v.base_output_boxes, 0) > 0 then v.base_output_boxes
                  else 1
                end
              end
            else case
              when coalesce(v.base_output_boxes, 0) > 0 then v.base_output_boxes
              when coalesce(v.base_batch, 0) > 0 then v.base_batch
              else 1
            end
          end::numeric as scale_base_qty
        from public.production_boms b
        join public.production_bom_versions v
          on v.bom_id = b.id
        left join public.products_cache pp
          on pp.sku_code = b.sku_code
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
        sv.scale_base_qty
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

comment on function public.explode_bom_batch(jsonb, integer)
is 'Recursive BOM explosion with scale by parent type: FG uses base_output_boxes, WIP uses mode (batch/base_batch or unit/base_output_boxes).';
