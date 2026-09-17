-- Allow multiple formula variants per finished good SKU.
-- Backward compatible: existing rows become DEFAULT formula.

alter table if exists public.production_bom_versions
  add column if not exists formula_code text;

alter table if exists public.production_bom_versions
  add column if not exists formula_name text;

update public.production_bom_versions
set formula_code = coalesce(nullif(trim(formula_code), ''), 'DEFAULT'),
    formula_name = coalesce(nullif(trim(formula_name), ''), 'สูตรหลัก')
where formula_code is null
   or trim(formula_code) = ''
   or formula_name is null
   or trim(formula_name) = '';

alter table if exists public.production_bom_versions
  alter column formula_code set default 'DEFAULT';

alter table if exists public.production_bom_versions
  alter column formula_name set default 'สูตรหลัก';

create index if not exists production_bom_versions_formula_idx
  on public.production_bom_versions (bom_id, formula_code, status, version_no desc);

alter table if exists public.production_plan_status
  add column if not exists formula_code text;

alter table if exists public.production_plan_status
  add column if not exists formula_name text;

alter table if exists public.production_plan_status
  add column if not exists bom_version_id uuid;

create index if not exists production_plan_status_formula_idx
  on public.production_plan_status (sku_code, formula_code, bom_version_id);
