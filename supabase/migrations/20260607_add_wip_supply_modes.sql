begin;

create table if not exists public.production_wip_policies (
  sku_code text primary key references public.products_cache(sku_code) on delete cascade,
  supply_mode text not null default 'stock',
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint production_wip_policies_supply_mode_check
    check (supply_mode in ('stock', 'make_to_order', 'hybrid'))
);

create index if not exists production_wip_policies_mode_idx
  on public.production_wip_policies (supply_mode, is_active);

drop trigger if exists production_wip_policies_set_updated_at on public.production_wip_policies;
create trigger production_wip_policies_set_updated_at
  before update on public.production_wip_policies
  for each row execute function public.set_updated_at();

insert into public.production_wip_policies (
  sku_code,
  supply_mode
)
select
  pc.sku_code,
  'stock'
from public.products_cache pc
where pc.iccat_code = '03'
  and coalesce(trim(pc.sku_code), '') <> ''
on conflict (sku_code) do nothing;

commit;
