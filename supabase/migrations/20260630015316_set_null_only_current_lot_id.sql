alter table public.production_weight_scale_products
  drop constraint if exists production_weight_scale_products_current_lot_fkey;

alter table public.production_weight_scale_products
  add constraint production_weight_scale_products_current_lot_fkey
  foreign key (current_lot_id, id)
  references public.production_weight_scale_lots(id, product_config_id)
  on delete set null (current_lot_id);

notify pgrst, 'reload schema';
