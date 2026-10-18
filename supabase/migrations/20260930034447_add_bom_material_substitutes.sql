alter table public.production_bom_items
  add column if not exists substitute_material_sku_codes text[] not null default '{}'::text[];

comment on column public.production_bom_items.substitute_material_sku_codes is
  'Alternative component SKU codes that may replace the primary BOM material when actually issued.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_substitutes_exclude_primary'
      and conrelid = 'public.production_bom_items'::regclass
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_substitutes_exclude_primary
      check (array_position(substitute_material_sku_codes, material_sku_code) is null);
  end if;
end
$$;

update public.production_bom_items as item
set substitute_material_sku_codes = array_append(
  item.substitute_material_sku_codes,
  'WKB-0068'
)
from public.production_bom_versions as version
join public.production_boms as bom on bom.id = version.bom_id
where item.version_id = version.id
  and upper(trim(bom.sku_code)) = 'B03-0003'
  and upper(trim(item.material_sku_code)) = 'WKB-0002'
  and not ('WKB-0068' = any(item.substitute_material_sku_codes));

notify pgrst, 'reload schema';
