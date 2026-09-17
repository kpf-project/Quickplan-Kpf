alter table if exists public.production_daily_work_logs
  add column if not exists doc_status text not null default 'active',
  add column if not exists revised_from_log_id uuid references public.production_daily_work_logs(id) on delete set null,
  add column if not exists revised_from_doc_no text,
  add column if not exists replaced_by_log_id uuid references public.production_daily_work_logs(id) on delete set null,
  add column if not exists replaced_by_doc_no text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

update public.production_daily_work_logs
set doc_status = 'active'
where doc_status is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_doc_status_check'
  ) then
    alter table public.production_daily_work_logs
      drop constraint production_daily_work_logs_doc_status_check;
  end if;
end $$;

alter table public.production_daily_work_logs
  add constraint production_daily_work_logs_doc_status_check
  check (doc_status in ('active', 'replaced', 'cancelled'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_revised_from_not_self_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_revised_from_not_self_check
      check (revised_from_log_id is null or revised_from_log_id <> id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_replaced_by_not_self_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_replaced_by_not_self_check
      check (replaced_by_log_id is null or replaced_by_log_id <> id);
  end if;
end $$;

create index if not exists production_daily_work_logs_doc_status_logged_at_idx
  on public.production_daily_work_logs (doc_status, logged_at desc);

create index if not exists production_daily_work_logs_revised_from_log_id_idx
  on public.production_daily_work_logs (revised_from_log_id);

create index if not exists production_daily_work_logs_replaced_by_log_id_idx
  on public.production_daily_work_logs (replaced_by_log_id);

create index if not exists production_daily_work_logs_cancelled_by_idx
  on public.production_daily_work_logs (cancelled_by, cancelled_at desc);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_log_revisions_action_check'
  ) then
    alter table public.production_daily_work_log_revisions
      drop constraint production_daily_work_log_revisions_action_check;
  end if;
end $$;

alter table public.production_daily_work_log_revisions
  add constraint production_daily_work_log_revisions_action_check
  check (action in ('update', 'replace', 'cancel'));
