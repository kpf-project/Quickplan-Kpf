alter table if exists public.production_piece_rate_logs
  add column if not exists is_edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id) on delete set null,
  add column if not exists edit_reason text,
  add column if not exists revised_from_log_id uuid references public.production_piece_rate_logs(id) on delete set null,
  add column if not exists revised_from_doc_no text,
  add column if not exists replaced_by_log_id uuid references public.production_piece_rate_logs(id) on delete set null,
  add column if not exists replaced_by_doc_no text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

update public.production_piece_rate_logs
set doc_status = 'active'
where doc_status is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'production_piece_rate_logs_doc_status_check'
  ) then
    alter table public.production_piece_rate_logs
      drop constraint production_piece_rate_logs_doc_status_check;
  end if;
end $$;

alter table public.production_piece_rate_logs
  add constraint production_piece_rate_logs_doc_status_check
  check (doc_status in ('active', 'replaced', 'cancelled'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_piece_rate_logs_revised_from_not_self_check'
  ) then
    alter table public.production_piece_rate_logs
      add constraint production_piece_rate_logs_revised_from_not_self_check
      check (revised_from_log_id is null or revised_from_log_id <> id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_piece_rate_logs_replaced_by_not_self_check'
  ) then
    alter table public.production_piece_rate_logs
      add constraint production_piece_rate_logs_replaced_by_not_self_check
      check (replaced_by_log_id is null or replaced_by_log_id <> id);
  end if;
end $$;

create index if not exists production_piece_rate_logs_doc_status_logged_at_idx
  on public.production_piece_rate_logs (doc_status, logged_at desc);

create index if not exists production_piece_rate_logs_edit_idx
  on public.production_piece_rate_logs (logged_at desc, is_edited);

create index if not exists production_piece_rate_logs_revised_from_log_id_idx
  on public.production_piece_rate_logs (revised_from_log_id);

create index if not exists production_piece_rate_logs_replaced_by_log_id_idx
  on public.production_piece_rate_logs (replaced_by_log_id);

create index if not exists production_piece_rate_logs_cancelled_by_idx
  on public.production_piece_rate_logs (cancelled_by, cancelled_at desc);

create table if not exists public.production_piece_rate_log_revisions (
  id bigserial primary key,
  log_id uuid not null references public.production_piece_rate_logs(id) on delete cascade,
  action text not null check (action in ('update', 'replace', 'cancel')),
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  edited_by uuid references auth.users(id) on delete set null,
  edit_reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists production_piece_rate_log_revisions_log_idx
  on public.production_piece_rate_log_revisions (log_id, created_at desc);

create index if not exists production_piece_rate_log_revisions_actor_idx
  on public.production_piece_rate_log_revisions (edited_by, created_at desc);

alter table public.production_piece_rate_log_revisions enable row level security;

drop policy if exists production_piece_rate_log_revisions_read on public.production_piece_rate_log_revisions;
create policy production_piece_rate_log_revisions_read
  on public.production_piece_rate_log_revisions
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-attendance-view')
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-view')
    or public.has_permission('production-line-attendance-report-manage')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_log_revisions_insert on public.production_piece_rate_log_revisions;
create policy production_piece_rate_log_revisions_insert
  on public.production_piece_rate_log_revisions
  for insert
  with check (
    public.is_admin()
    or public.has_permission('production-line-attendance-manage')
    or public.has_permission('production-line-attendance-report-manage')
  );

drop policy if exists production_piece_rate_log_revisions_update_admin_only on public.production_piece_rate_log_revisions;
create policy production_piece_rate_log_revisions_update_admin_only
  on public.production_piece_rate_log_revisions
  for update
  using (public.is_admin())
  with check (public.is_admin());
