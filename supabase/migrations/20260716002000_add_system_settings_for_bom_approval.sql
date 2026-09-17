create table if not exists public.system_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

drop policy if exists system_settings_admin_read on public.system_settings;
create policy system_settings_admin_read
  on public.system_settings
  for select
  using (
    public.has_permission('admin-settings')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists system_settings_admin_manage on public.system_settings;
create policy system_settings_admin_manage
  on public.system_settings
  for all
  using (public.has_permission('admin-settings'))
  with check (public.has_permission('admin-settings'));

insert into public.system_settings (setting_key, setting_value)
values ('production_bom.require_approval', '{"requireApproval": true}'::jsonb)
on conflict (setting_key) do nothing;
