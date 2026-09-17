create table if not exists public.production_material_verify_confirmations (
  id uuid primary key default gen_random_uuid(),
  master_plan_no text not null,
  grain text not null default 'daily',
  bucket_date date not null,
  material_sku_code text not null,
  material_goods_code text not null,
  assigned_department_id uuid not null references public.production_departments(id) on delete restrict,
  verified_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_material_verify_confirmations_grain_check
    check (grain in ('daily', 'weekly')),
  constraint production_material_verify_confirmations_unique
    unique (master_plan_no, grain, bucket_date, material_goods_code, assigned_department_id)
);

create index if not exists production_material_verify_confirmations_plan_idx
  on public.production_material_verify_confirmations (master_plan_no, grain, bucket_date);

create index if not exists production_material_verify_confirmations_department_idx
  on public.production_material_verify_confirmations (assigned_department_id, bucket_date);

drop trigger if exists production_material_verify_confirmations_set_updated_at
  on public.production_material_verify_confirmations;
create trigger production_material_verify_confirmations_set_updated_at
  before update on public.production_material_verify_confirmations
  for each row execute function public.set_updated_at();

alter table public.production_material_verify_confirmations enable row level security;

drop policy if exists production_material_verify_confirmations_read
  on public.production_material_verify_confirmations;
create policy production_material_verify_confirmations_read
  on public.production_material_verify_confirmations
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.view_all')
    or public.has_permission('plan.view_claim_all')
    or public.has_permission('plan.verify_materials')
    or public.has_permission('plan.claim_material')
  );

drop policy if exists production_material_verify_confirmations_write
  on public.production_material_verify_confirmations;
create policy production_material_verify_confirmations_write
  on public.production_material_verify_confirmations
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.verify_materials')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.verify_materials')
  );

comment on table public.production_material_verify_confirmations
  is 'Records material-owner department verification before material claim is allowed.';
