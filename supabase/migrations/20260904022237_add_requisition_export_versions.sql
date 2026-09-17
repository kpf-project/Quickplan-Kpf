create table if not exists public.production_requisition_export_versions (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references public.production_requisition_export_batches(id) on delete restrict,
  doc_ref text not null,
  version_no integer not null,
  exported_at timestamptz not null default timezone('utc', now()),
  exported_by uuid null references public.profiles(id) on delete set null,
  export_snapshot jsonb not null,
  lines_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  constraint production_requisition_export_versions_version_positive check (version_no > 0),
  constraint production_requisition_export_versions_doc_version_unique unique (doc_ref, version_no),
  constraint production_requisition_export_versions_batch_doc_unique unique (export_batch_id, doc_ref)
);

create index if not exists production_requisition_export_versions_doc_idx
  on public.production_requisition_export_versions (doc_ref, version_no desc);

alter table public.production_requisition_export_versions enable row level security;
revoke all on public.production_requisition_export_versions from anon, authenticated;
grant select, insert on public.production_requisition_export_versions to service_role;

create or replace function public.save_requisition_export_version(
  p_export_batch_id uuid,
  p_exports jsonb,
  p_lines jsonb,
  p_exported_by uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_export jsonb;
  v_doc_ref text;
  v_version_no integer;
  v_lines jsonb;
  v_previous_export jsonb;
  v_previous_lines jsonb;
  v_previous_batch_id uuid;
begin
  if p_export_batch_id is null
     or jsonb_typeof(p_exports) <> 'array'
     or jsonb_array_length(p_exports) = 0
     or jsonb_typeof(p_lines) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid requisition export version payload';
  end if;

  for v_export in select value from jsonb_array_elements(p_exports)
  loop
    v_doc_ref := nullif(trim(v_export->>'doc_ref'), '');
    if v_doc_ref is null then
      raise exception using errcode = '22023', message = 'doc_ref is required';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('requisition-export:' || v_doc_ref, 0));

    if not exists (
      select 1 from public.production_requisition_export_versions where doc_ref = v_doc_ref
    ) then
      select to_jsonb(current_export) into v_previous_export
      from public.production_requisition_exports current_export
      where current_export.doc_ref = v_doc_ref;

      if v_previous_export is not null then
        select group_batch.export_batch_id into v_previous_batch_id
        from public.production_requisition_group_batches group_batch
        where group_batch.document_no = v_doc_ref
          and group_batch.export_batch_id is not null
        order by group_batch.exported_at desc nulls last
        limit 1;

        select coalesce(jsonb_agg(to_jsonb(current_line) order by current_line.line_seq), '[]'::jsonb)
        into v_previous_lines
        from public.production_requisition_export_lines current_line
        where current_line.doc_ref = v_doc_ref;

        if v_previous_batch_id is not null then
          insert into public.production_requisition_export_versions (
            export_batch_id, doc_ref, version_no, exported_at, exported_by,
            export_snapshot, lines_snapshot, metadata
          ) values (
            v_previous_batch_id, v_doc_ref, 1,
            coalesce((v_previous_export->>'exported_at')::timestamptz, timezone('utc', now())),
            nullif(v_previous_export->>'exported_by', '')::uuid,
            v_previous_export, v_previous_lines,
            jsonb_build_object('legacyBackfill', true)
          ) on conflict (export_batch_id, doc_ref) do nothing;
        end if;
      end if;
    end if;

    select coalesce(max(version_no), 0) + 1 into v_version_no
    from public.production_requisition_export_versions
    where doc_ref = v_doc_ref;

    select coalesce(jsonb_agg(line order by (line->>'line_seq')::integer), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(p_lines) line
    where line->>'doc_ref' = v_doc_ref;

    insert into public.production_requisition_export_versions (
      export_batch_id, doc_ref, version_no, exported_by,
      export_snapshot, lines_snapshot, metadata
    ) values (
      p_export_batch_id, v_doc_ref, v_version_no, p_exported_by,
      v_export, v_lines, coalesce(p_metadata, '{}'::jsonb)
    );

    insert into public.production_requisition_exports (
      doc_ref, master_plan_no, sub_plan_no, department_id, export_mode,
      date_from, date_to, status, exported_at, exported_by,
      created_by, updated_by, reconcile_result
    ) values (
      v_doc_ref, v_export->>'master_plan_no', nullif(v_export->>'sub_plan_no', ''),
      nullif(v_export->>'department_id', '')::uuid, v_export->>'export_mode',
      nullif(v_export->>'date_from', '')::date, nullif(v_export->>'date_to', '')::date,
      v_export->>'status', nullif(v_export->>'exported_at', '')::timestamptz,
      nullif(v_export->>'exported_by', '')::uuid, nullif(v_export->>'created_by', '')::uuid,
      nullif(v_export->>'updated_by', '')::uuid,
      coalesce(v_export->'reconcile_result', '{}'::jsonb) || jsonb_build_object('versionNo', v_version_no, 'exportBatchId', p_export_batch_id)
    )
    on conflict (doc_ref) do update set
      master_plan_no = excluded.master_plan_no,
      department_id = excluded.department_id,
      export_mode = excluded.export_mode,
      date_from = excluded.date_from,
      date_to = excluded.date_to,
      status = excluded.status,
      exported_at = excluded.exported_at,
      exported_by = excluded.exported_by,
      updated_by = excluded.updated_by,
      reconcile_result = excluded.reconcile_result;

    delete from public.production_requisition_export_lines where doc_ref = v_doc_ref;
    insert into public.production_requisition_export_lines (
      doc_ref, line_seq, sku_code, sku_name, qty, uom, lot_no,
      warehouse_code, remark, meta
    )
    select
      line->>'doc_ref', (line->>'line_seq')::integer, line->>'sku_code',
      line->>'sku_name', (line->>'qty')::numeric, nullif(line->>'uom', ''),
      nullif(line->>'lot_no', ''), nullif(line->>'warehouse_code', ''),
      nullif(line->>'remark', ''), coalesce(line->'meta', '{}'::jsonb)
    from jsonb_array_elements(v_lines) line;
  end loop;

  return jsonb_build_object('saved', jsonb_array_length(p_exports));
end;
$$;

revoke all on function public.save_requisition_export_version(uuid, jsonb, jsonb, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_requisition_export_version(uuid, jsonb, jsonb, uuid, jsonb)
  to service_role;
