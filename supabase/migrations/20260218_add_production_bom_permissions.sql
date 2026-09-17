insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('production-line-bom-view', 'Production Line BOM (View)', '/production-line/bom', 'production-line', now()),
  ('production-line-bom-manage', 'Production Line BOM (Manage)', '/production-line/bom/manage', 'production-line', now())
on conflict (perm_key) do nothing;

alter table public.production_bom_versions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

drop policy if exists products_cache_read_bom on public.products_cache;
drop policy if exists products_cache_read_bom_view on public.products_cache;
create policy products_cache_read_bom_view
  on public.products_cache
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_categories_read_bom on public.production_categories;
drop policy if exists production_categories_read_bom_view on public.production_categories;
create policy production_categories_read_bom_view
  on public.production_categories
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_category_products_read_bom on public.production_category_products;
drop policy if exists production_category_products_read_bom_view on public.production_category_products;
create policy production_category_products_read_bom_view
  on public.production_category_products
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_boms_read on public.production_boms;
drop policy if exists production_boms_read_bom_view on public.production_boms;
create policy production_boms_read_bom_view
  on public.production_boms
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_boms_manage on public.production_boms;
drop policy if exists production_boms_manage_bom on public.production_boms;
create policy production_boms_manage_bom
  on public.production_boms
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_versions_read on public.production_bom_versions;
drop policy if exists production_bom_versions_read_bom_view on public.production_bom_versions;
create policy production_bom_versions_read_bom_view
  on public.production_bom_versions
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_versions_manage on public.production_bom_versions;
drop policy if exists production_bom_versions_manage_bom on public.production_bom_versions;
create policy production_bom_versions_manage_bom
  on public.production_bom_versions
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_items_read on public.production_bom_items;
drop policy if exists production_bom_items_read_bom_view on public.production_bom_items;
create policy production_bom_items_read_bom_view
  on public.production_bom_items
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-view')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_items_manage on public.production_bom_items;
drop policy if exists production_bom_items_manage_bom on public.production_bom_items;
create policy production_bom_items_manage_bom
  on public.production_bom_items
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-bom-manage')
  );
