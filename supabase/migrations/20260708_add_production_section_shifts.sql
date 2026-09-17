create table if not exists public.production_section_shifts (
  id uuid primary key default gen_random_uuid(),
  section_def_id uuid not null references public.production_schedule_section_defs(id) on delete cascade,
  shift_id uuid not null references public.production_shifts(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  created_by uuid,
  updated_by uuid,
  constraint production_section_shifts_sort_order_check check (sort_order between 0 and 9999)
);

create unique index if not exists production_section_shifts_section_shift_unique
  on public.production_section_shifts (section_def_id, shift_id)
  where deleted_at is null;

create index if not exists production_section_shifts_section_idx
  on public.production_section_shifts (section_def_id, is_active, sort_order)
  where deleted_at is null;

create index if not exists production_section_shifts_shift_idx
  on public.production_section_shifts (shift_id)
  where deleted_at is null;

drop trigger if exists production_section_shifts_set_updated_at
  on public.production_section_shifts;
create trigger production_section_shifts_set_updated_at
  before update on public.production_section_shifts
  for each row execute function public.set_updated_at();

alter table public.production_section_shifts enable row level security;

drop policy if exists production_section_shifts_read on public.production_section_shifts;
create policy production_section_shifts_read
  on public.production_section_shifts
  for select
  to authenticated
  using (
    public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-planning-view')
    or public.has_permission('production-line-planning-manage')
    or public.has_permission('plan.calculate_own_dept')
    or public.has_permission('plan.edit_own_dept')
  );

drop policy if exists production_section_shifts_manage on public.production_section_shifts;
create policy production_section_shifts_manage
  on public.production_section_shifts
  for all
  to authenticated
  using (public.has_permission('production-line-settings-manage'))
  with check (public.has_permission('production-line-settings-manage'));
