begin;

create table if not exists public.production_material_owners (
  id bigserial primary key,
  material_sku_code text not null references public.products_cache(sku_code) on delete restrict,
  department_id uuid not null references public.production_departments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create unique index if not exists production_material_owners_sku_unique
  on public.production_material_owners (material_sku_code);

create index if not exists production_material_owners_department_idx
  on public.production_material_owners (department_id, material_sku_code);

drop trigger if exists production_material_owners_set_updated_at on public.production_material_owners;
create trigger production_material_owners_set_updated_at
  before update on public.production_material_owners
  for each row execute function public.set_updated_at();

-- Backfill initial material owners from existing product owner mapping.
-- Only copy rows that are material-like categories (WIP + RAW).
insert into public.production_material_owners (
  material_sku_code,
  department_id,
  created_by,
  updated_by
)
select
  pdp.sku_code,
  pdp.department_id,
  pdp.created_by,
  pdp.created_by
from public.production_department_products pdp
inner join public.products_cache pc
  on pc.sku_code = pdp.sku_code
where pdp.is_owner = true
  and pc.iccat_code in ('03', '04', '04-1', '04-2')
on conflict (material_sku_code) do nothing;

alter table public.production_material_owners enable row level security;

drop policy if exists production_material_owners_read on public.production_material_owners;
create policy production_material_owners_read
  on public.production_material_owners
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_material_owners_manage on public.production_material_owners;
create policy production_material_owners_manage
  on public.production_material_owners
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );

commit;
