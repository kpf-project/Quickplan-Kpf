create table if not exists public.production_snack_wage_config (
  id integer primary key default 1,
  arranged_rate_per_kg numeric(12, 4) not null default 0 check (arranged_rate_per_kg >= 0),
  not_arranged_rate_per_kg numeric(12, 4) not null default 0 check (not_arranged_rate_per_kg >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint production_snack_wage_config_singleton_id_check
    check (id = 1)
);

insert into public.production_snack_wage_config (
  id,
  arranged_rate_per_kg,
  not_arranged_rate_per_kg,
  is_active
)
values (1, 0, 0, true)
on conflict (id) do nothing;

create table if not exists public.production_snack_wage_product_mappings (
  product_code text primary key,
  wage_mode text not null check (wage_mode in ('arranged', 'not_arranged')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists production_snack_wage_product_mappings_mode_idx
  on public.production_snack_wage_product_mappings (wage_mode);

alter table public.production_snack_yield_logs
  add column if not exists wage_mode_snapshot text check (wage_mode_snapshot in ('arranged', 'not_arranged'));

alter table public.production_snack_yield_logs
  add column if not exists pay_rate_per_kg_snapshot numeric(12, 4) not null default 0
  check (pay_rate_per_kg_snapshot >= 0);

alter table public.production_snack_yield_logs
  add column if not exists wage_amount_snapshot numeric(14, 4) not null default 0
  check (wage_amount_snapshot >= 0);

create index if not exists production_snack_yield_logs_wage_mode_idx
  on public.production_snack_yield_logs (wage_mode_snapshot);

alter table public.production_snack_wage_config enable row level security;
alter table public.production_snack_wage_product_mappings enable row level security;

drop policy if exists production_snack_wage_config_read on public.production_snack_wage_config;
create policy production_snack_wage_config_read
  on public.production_snack_wage_config
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_snack_wage_config_manage on public.production_snack_wage_config;
create policy production_snack_wage_config_manage
  on public.production_snack_wage_config
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_snack_wage_product_mappings_read on public.production_snack_wage_product_mappings;
create policy production_snack_wage_product_mappings_read
  on public.production_snack_wage_product_mappings
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_snack_wage_product_mappings_manage on public.production_snack_wage_product_mappings;
create policy production_snack_wage_product_mappings_manage
  on public.production_snack_wage_product_mappings
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );
