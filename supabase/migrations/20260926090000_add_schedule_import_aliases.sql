create table if not exists public.production_schedule_import_aliases (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.production_departments(id) on delete cascade,
  section_def_id uuid not null references public.production_schedule_section_defs(id) on delete cascade,
  product_column_key text not null,
  source_signature text not null,
  source_brand text,
  source_product text,
  source_size text,
  sku_code text not null,
  formula_code text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dept_id, section_def_id, product_column_key, source_signature)
);

create index if not exists idx_schedule_import_aliases_lookup
  on public.production_schedule_import_aliases (
    dept_id,
    section_def_id,
    product_column_key,
    source_signature
  );

alter table public.production_schedule_import_aliases enable row level security;

create policy "schedule_import_aliases_read"
  on public.production_schedule_import_aliases
  for select
  to authenticated
  using (true);

create or replace trigger trg_schedule_import_aliases_updated_at
  before update on public.production_schedule_import_aliases
  for each row execute function public.set_updated_at();
