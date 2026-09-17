create table if not exists public.production_shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  constraint production_shifts_code_not_blank check (length(trim(code)) > 0),
  constraint production_shifts_name_not_blank check (length(trim(name)) > 0),
  constraint production_shifts_sort_order_check check (sort_order between 0 and 9999)
);

create unique index if not exists production_shifts_code_unique
  on public.production_shifts (lower(code))
  where deleted_at is null;

create unique index if not exists production_shifts_name_unique
  on public.production_shifts (lower(name))
  where deleted_at is null;

create index if not exists production_shifts_active_sort_idx
  on public.production_shifts (is_active, sort_order, name)
  where deleted_at is null;

drop trigger if exists production_shifts_set_updated_at
  on public.production_shifts;
create trigger production_shifts_set_updated_at
  before update on public.production_shifts
  for each row execute function public.set_updated_at();

alter table public.production_shifts enable row level security;

drop policy if exists production_shifts_read on public.production_shifts;
create policy production_shifts_read
  on public.production_shifts
  for select
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_shifts_manage on public.production_shifts;
create policy production_shifts_manage
  on public.production_shifts
  for all
  using (
    public.has_permission('production-line-settings-manage')
  )
  with check (
    public.has_permission('production-line-settings-manage')
  );

insert into public.production_shifts (
  code,
  name,
  start_time,
  end_time,
  crosses_midnight,
  sort_order,
  is_active
)
values
  ('SHIFT1', 'กะ 1', '07:00', '16:00', false, 10, true),
  ('SHIFT2', 'กะ 2', '19:00', '04:00', true, 20, true)
on conflict do nothing;

update public.production_shifts
set name = 'กะ 1'
where code = 'SHIFT1'
  and name is distinct from 'กะ 1';

update public.production_shifts
set name = 'กะ 2'
where code = 'SHIFT2'
  and name is distinct from 'กะ 2';

alter table if exists public.production_plan_status
  add column if not exists shift_id uuid references public.production_shifts(id) on delete set null;

alter table if exists public.production_plan_status
  add column if not exists shift_code text;

alter table if exists public.production_plan_status
  add column if not exists shift_name text;

create index if not exists production_plan_status_shift_id_idx
  on public.production_plan_status (shift_id);

create index if not exists production_plan_status_shift_code_idx
  on public.production_plan_status (shift_code)
  where shift_code is not null;
