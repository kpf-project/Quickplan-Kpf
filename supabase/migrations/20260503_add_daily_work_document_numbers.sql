create table if not exists public.production_daily_work_doc_counters (
  machine_code text not null,
  year_be integer not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint production_daily_work_doc_counters_pkey primary key (machine_code, year_be),
  constraint production_daily_work_doc_counters_machine_code_check
    check (machine_code ~ '^[A-Z0-9]{2,8}$'),
  constraint production_daily_work_doc_counters_year_be_check
    check (year_be between 2500 and 2999),
  constraint production_daily_work_doc_counters_last_seq_check
    check (last_seq >= 0)
);

create or replace function public.next_production_daily_work_doc_seq(
  p_machine_code text,
  p_year_be integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine_code text;
  v_next integer;
begin
  v_machine_code := upper(regexp_replace(coalesce(trim(p_machine_code), ''), '[^A-Z0-9]', '', 'g'));

  if v_machine_code = '' then
    raise exception 'machine code is required';
  end if;

  if char_length(v_machine_code) < 2 or char_length(v_machine_code) > 8 then
    raise exception 'machine code must be 2-8 alphanumeric characters';
  end if;

  if p_year_be is null or p_year_be < 2500 or p_year_be > 2999 then
    raise exception 'year_be must be between 2500 and 2999';
  end if;

  insert into public.production_daily_work_doc_counters (
    machine_code,
    year_be,
    last_seq,
    updated_at
  )
  values (
    v_machine_code,
    p_year_be,
    1,
    now()
  )
  on conflict (machine_code, year_be)
  do update set
    last_seq = public.production_daily_work_doc_counters.last_seq + 1,
    updated_at = now()
  returning last_seq into v_next;

  return v_next;
end;
$$;

revoke all on function public.next_production_daily_work_doc_seq(text, integer) from public;
grant execute on function public.next_production_daily_work_doc_seq(text, integer) to authenticated;
grant execute on function public.next_production_daily_work_doc_seq(text, integer) to service_role;

alter table if exists public.production_daily_work_logs
  add column if not exists machine_code text,
  add column if not exists doc_year_be integer,
  add column if not exists doc_seq integer,
  add column if not exists doc_no text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_machine_code_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_machine_code_check
      check (machine_code is null or machine_code ~ '^[A-Z0-9]{2,8}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_doc_year_be_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_doc_year_be_check
      check (doc_year_be is null or doc_year_be between 2500 and 2999);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_doc_seq_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_doc_seq_check
      check (doc_seq is null or (doc_seq >= 1 and doc_seq <= 99999));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_daily_work_logs_doc_no_check'
  ) then
    alter table public.production_daily_work_logs
      add constraint production_daily_work_logs_doc_no_check
      check (doc_no is null or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}[0-9]{5}$');
  end if;
end $$;

create unique index if not exists production_daily_work_logs_doc_no_unique_idx
  on public.production_daily_work_logs (doc_no)
  where doc_no is not null;

create unique index if not exists production_daily_work_logs_machine_year_seq_unique_idx
  on public.production_daily_work_logs (machine_code, doc_year_be, doc_seq)
  where machine_code is not null and doc_year_be is not null and doc_seq is not null;

create index if not exists production_daily_work_logs_machine_logged_at_idx
  on public.production_daily_work_logs (machine_code, logged_at desc);
