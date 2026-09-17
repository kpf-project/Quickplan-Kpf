alter table public.products_cache
  add column if not exists icdept_code text;

alter table public.products_cache
  add column if not exists icdept_name text;
