alter table public.production_bom_items
  add column if not exists material_goods_code text;

create index if not exists production_bom_items_material_goods_idx
  on public.production_bom_items (material_goods_code);
