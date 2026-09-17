create table if not exists public.production_report_doc_counters (
  report_type text not null,
  date_from date not null,
  date_to date not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint production_report_doc_counters_pkey primary key (report_type, date_from, date_to),
  constraint production_report_doc_counters_report_type_check
    check (report_type in ('PRD', 'PRG', 'PRE', 'PRS')),
  constraint production_report_doc_counters_last_seq_check
    check (last_seq >= 0)
);

create table if not exists public.production_report_documents (
  id bigserial primary key,
  report_type text not null,
  view_mode text not null,
  date_from date not null,
  date_to date not null,
  scope_hash text not null,
  doc_seq integer not null,
  latest_revision integer not null default 0,
  latest_snapshot_hash text not null,
  latest_doc_no text not null,
  latest_issued_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_report_documents_report_type_check
    check (report_type in ('PRD', 'PRG', 'PRE', 'PRS')),
  constraint production_report_documents_view_mode_check
    check (view_mode in ('detail', 'grouped', 'employee', 'product')),
  constraint production_report_documents_doc_seq_check
    check (doc_seq >= 1),
  constraint production_report_documents_latest_revision_check
    check (latest_revision >= 0),
  constraint production_report_documents_scope_uidx
    unique (report_type, date_from, date_to, scope_hash),
  constraint production_report_documents_seq_uidx
    unique (report_type, date_from, date_to, doc_seq)
);

create table if not exists public.production_report_doc_audits (
  id bigserial primary key,
  document_id bigint not null references public.production_report_documents(id) on delete cascade,
  report_type text not null,
  view_mode text not null,
  date_from date not null,
  date_to date not null,
  scope_hash text not null,
  snapshot_hash text not null,
  doc_seq integer not null,
  revision_no integer not null,
  doc_no text not null,
  action text not null default 'issue',
  actor_user_id uuid references auth.users(id) on delete set null,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_report_doc_audits_report_type_check
    check (report_type in ('PRD', 'PRG', 'PRE', 'PRS')),
  constraint production_report_doc_audits_view_mode_check
    check (view_mode in ('detail', 'grouped', 'employee', 'product')),
  constraint production_report_doc_audits_doc_seq_check
    check (doc_seq >= 1),
  constraint production_report_doc_audits_revision_no_check
    check (revision_no >= 0),
  constraint production_report_doc_audits_action_check
    check (action in ('issue', 'revision', 'reprint')),
  constraint production_report_doc_audits_doc_no_check
    check (doc_no ~ '^RPT-(PRD|PRG|PRE|PRS)-[0-9]{6}-[0-9]{6}-[0-9]+-R[0-9]+$')
);

create index if not exists production_report_doc_audits_doc_no_idx
  on public.production_report_doc_audits (doc_no, created_at desc);

create index if not exists production_report_doc_audits_document_created_idx
  on public.production_report_doc_audits (document_id, created_at desc);

create unique index if not exists production_report_doc_audits_request_uidx
  on public.production_report_doc_audits (request_id)
  where request_id is not null and btrim(request_id) <> '';

create or replace function public.issue_production_report_doc_number(
  p_report_type text,
  p_view_mode text,
  p_date_from date,
  p_date_to date,
  p_scope_hash text,
  p_snapshot_hash text,
  p_actor_user_id uuid default null,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_type text;
  v_view_mode text;
  v_scope_hash text;
  v_snapshot_hash text;
  v_request_id text;
  v_existing_audit public.production_report_doc_audits%rowtype;
  v_document public.production_report_documents%rowtype;
  v_doc_seq integer;
  v_revision_no integer;
  v_doc_no text;
  v_action text;
  v_now timestamptz;
  v_print_count integer;
begin
  v_now := now();
  v_report_type := upper(coalesce(trim(p_report_type), ''));
  v_view_mode := lower(coalesce(trim(p_view_mode), ''));
  v_scope_hash := coalesce(trim(p_scope_hash), '');
  v_snapshot_hash := coalesce(trim(p_snapshot_hash), '');
  v_request_id := nullif(trim(coalesce(p_request_id, '')), '');

  if v_report_type not in ('PRD', 'PRG', 'PRE', 'PRS') then
    raise exception 'report_type is invalid';
  end if;
  if v_view_mode not in ('detail', 'grouped', 'employee', 'product') then
    raise exception 'view_mode is invalid';
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from then
    raise exception 'report date range is invalid';
  end if;
  if v_scope_hash = '' then
    raise exception 'scope_hash is required';
  end if;
  if v_snapshot_hash = '' then
    raise exception 'snapshot_hash is required';
  end if;

  if v_request_id is not null then
    select *
    into v_existing_audit
    from public.production_report_doc_audits
    where request_id = v_request_id
    order by id desc
    limit 1;

    if found then
      select count(*)
      into v_print_count
      from public.production_report_doc_audits
      where document_id = v_existing_audit.document_id
        and revision_no = v_existing_audit.revision_no;

      return jsonb_build_object(
        'doc_seq', v_existing_audit.doc_seq,
        'revision_no', v_existing_audit.revision_no,
        'doc_no', v_existing_audit.doc_no,
        'action', v_existing_audit.action,
        'is_reprint', v_existing_audit.action = 'reprint',
        'issued_at', v_existing_audit.created_at,
        'print_count', greatest(coalesce(v_print_count, 0), 1)
      );
    end if;
  end if;

  select *
  into v_document
  from public.production_report_documents
  where report_type = v_report_type
    and date_from = p_date_from
    and date_to = p_date_to
    and scope_hash = v_scope_hash
  for update;

  if not found then
    insert into public.production_report_doc_counters (
      report_type,
      date_from,
      date_to,
      last_seq,
      updated_at
    )
    values (
      v_report_type,
      p_date_from,
      p_date_to,
      1,
      v_now
    )
    on conflict (report_type, date_from, date_to)
    do update set
      last_seq = public.production_report_doc_counters.last_seq + 1,
      updated_at = v_now
    returning last_seq into v_doc_seq;

    v_revision_no := 0;
    v_doc_no := 'RPT-'
      || v_report_type
      || '-'
      || to_char(p_date_from, 'YYMMDD')
      || '-'
      || to_char(p_date_to, 'YYMMDD')
      || '-'
      || v_doc_seq::text
      || '-R'
      || v_revision_no::text;
    v_action := 'issue';

    insert into public.production_report_documents (
      report_type,
      view_mode,
      date_from,
      date_to,
      scope_hash,
      doc_seq,
      latest_revision,
      latest_snapshot_hash,
      latest_doc_no,
      latest_issued_at,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_report_type,
      v_view_mode,
      p_date_from,
      p_date_to,
      v_scope_hash,
      v_doc_seq,
      v_revision_no,
      v_snapshot_hash,
      v_doc_no,
      v_now,
      p_actor_user_id,
      p_actor_user_id,
      v_now,
      v_now
    )
    returning * into v_document;
  elsif v_document.latest_snapshot_hash = v_snapshot_hash then
    v_doc_seq := v_document.doc_seq;
    v_revision_no := v_document.latest_revision;
    v_doc_no := v_document.latest_doc_no;
    v_action := 'reprint';
  else
    v_doc_seq := v_document.doc_seq;
    v_revision_no := v_document.latest_revision + 1;
    v_doc_no := 'RPT-'
      || v_report_type
      || '-'
      || to_char(p_date_from, 'YYMMDD')
      || '-'
      || to_char(p_date_to, 'YYMMDD')
      || '-'
      || v_doc_seq::text
      || '-R'
      || v_revision_no::text;
    v_action := 'revision';

    update public.production_report_documents
    set
      latest_revision = v_revision_no,
      latest_snapshot_hash = v_snapshot_hash,
      latest_doc_no = v_doc_no,
      latest_issued_at = v_now,
      updated_by = p_actor_user_id,
      updated_at = v_now
    where id = v_document.id
    returning * into v_document;
  end if;

  insert into public.production_report_doc_audits (
    document_id,
    report_type,
    view_mode,
    date_from,
    date_to,
    scope_hash,
    snapshot_hash,
    doc_seq,
    revision_no,
    doc_no,
    action,
    actor_user_id,
    request_id,
    metadata,
    created_at
  )
  values (
    v_document.id,
    v_report_type,
    v_view_mode,
    p_date_from,
    p_date_to,
    v_scope_hash,
    v_snapshot_hash,
    v_doc_seq,
    v_revision_no,
    v_doc_no,
    v_action,
    p_actor_user_id,
    v_request_id,
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  );

  select count(*)
  into v_print_count
  from public.production_report_doc_audits
  where document_id = v_document.id
    and revision_no = v_revision_no;

  return jsonb_build_object(
    'doc_seq', v_doc_seq,
    'revision_no', v_revision_no,
    'doc_no', v_doc_no,
    'action', v_action,
    'is_reprint', v_action = 'reprint',
    'issued_at', v_now,
    'print_count', greatest(coalesce(v_print_count, 0), 1)
  );
end;
$$;

revoke all on function public.issue_production_report_doc_number(text, text, date, date, text, text, uuid, text, jsonb) from public;
grant execute on function public.issue_production_report_doc_number(text, text, date, date, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.issue_production_report_doc_number(text, text, date, date, text, text, uuid, text, jsonb) to service_role;
