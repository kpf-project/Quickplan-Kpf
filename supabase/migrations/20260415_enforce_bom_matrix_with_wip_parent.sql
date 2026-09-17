create or replace function public.resolve_bom_item_type(iccat_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(trim(coalesce(iccat_code, '')))
    when '04' then 'FG'
    when '04-1' then 'FG'
    when '04-2' then 'FG'
    when '03' then 'WIP'
    when '01' then 'RAW'
    when '02' then 'RAW'
    when '05' then 'RAW'
    when '08' then 'RAW'
    when '10' then 'RAW'
    else 'UNKNOWN'
  end
$$;

create or replace function public.is_bom_matrix_allowed(parent_type text, child_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when parent_type = 'FG' and child_type in ('WIP', 'RAW') then true
    when parent_type = 'WIP' and child_type = 'RAW' then true
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
begin
  select p.iccat_code
    into parent_iccat
  from public.production_bom_versions v
  join public.production_boms b on b.id = v.bom_id
  join public.products_cache p on p.sku_code = b.sku_code
  where v.id = new.version_id;

  if parent_iccat is null then
    raise exception 'BOM parent category not found for version_id=%', new.version_id;
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

  if not public.is_bom_matrix_allowed(parent_type, child_type) then
    raise exception 'BOM matrix violation: parent_type=% child_type=% material_sku_code=%',
      parent_type, child_type, new.material_sku_code;
  end if;

  return new;
end
$$;

drop trigger if exists production_bom_items_validate_matrix on public.production_bom_items;
create trigger production_bom_items_validate_matrix
before insert or update of version_id, material_sku_code
on public.production_bom_items
for each row
execute function public.validate_bom_matrix_item();
