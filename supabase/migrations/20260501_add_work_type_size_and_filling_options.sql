create table if not exists public.production_work_type_choice_options (
  id bigserial primary key,
  work_type_id uuid not null references public.production_work_types(id) on delete cascade,
  field_key text not null
    check (field_key in ('size', 'filling')),
  option_value text not null,
  option_label text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint production_work_type_choice_options_option_value_check
    check (length(trim(option_value)) > 0)
);

create unique index if not exists production_work_type_choice_options_unique_idx
  on public.production_work_type_choice_options (work_type_id, field_key, lower(option_value))
  where deleted_at is null;

create index if not exists production_work_type_choice_options_work_type_idx
  on public.production_work_type_choice_options (work_type_id, field_key, sort_order);

drop trigger if exists production_work_type_choice_options_set_updated_at
  on public.production_work_type_choice_options;
create trigger production_work_type_choice_options_set_updated_at
  before update on public.production_work_type_choice_options
  for each row execute function public.set_updated_at();

alter table public.production_work_type_choice_options enable row level security;

drop policy if exists production_work_type_choice_options_read on public.production_work_type_choice_options;
create policy production_work_type_choice_options_read
  on public.production_work_type_choice_options
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
  );

drop policy if exists production_work_type_choice_options_manage on public.production_work_type_choice_options;
create policy production_work_type_choice_options_manage
  on public.production_work_type_choice_options
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

alter table public.production_daily_work_logs
  add column if not exists size_value_snapshot text,
  add column if not exists filling_value_snapshot text;
