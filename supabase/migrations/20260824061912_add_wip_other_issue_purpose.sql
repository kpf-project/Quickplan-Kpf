create table if not exists public.production_wip_can_issue_details (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null unique references public.production_wip_can_movements(id) on delete restrict,
  issue_purpose text not null check (
    issue_purpose in ('customer_sample', 'quality_test', 'internal_use', 'other')
  ),
  recipient_note text,
  created_at timestamptz not null default now()
);

create index if not exists production_wip_can_issue_details_purpose_idx
  on public.production_wip_can_issue_details (issue_purpose, created_at desc);

alter table public.production_wip_can_issue_details enable row level security;

revoke all on public.production_wip_can_issue_details from public, anon, authenticated;
grant all on public.production_wip_can_issue_details to service_role;

create or replace function public.issue_wip_cans_other_atomic(
  p_request_id text,
  p_movement_no text,
  p_source_document_id uuid,
  p_barcode text,
  p_lot_no text,
  p_quantity integer,
  p_issue_date date,
  p_actor_user_id uuid,
  p_notes text,
  p_issue_purpose text,
  p_recipient_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_movement_id uuid;
  v_purpose text := lower(trim(coalesce(p_issue_purpose, '')));
begin
  if v_purpose not in ('customer_sample', 'quality_test', 'internal_use', 'other') then
    raise exception 'ประเภทการเบิก WIP ไม่ถูกต้อง';
  end if;

  v_result := public.issue_wip_cans_atomic(
    p_request_id,
    p_movement_no,
    p_source_document_id,
    p_barcode,
    p_lot_no,
    p_quantity,
    p_issue_date,
    p_actor_user_id,
    p_notes
  );

  v_movement_id := nullif(v_result->>'movementId', '')::uuid;
  if v_movement_id is null then
    select id into v_movement_id
    from public.production_wip_can_movements
    where request_id = trim(p_request_id);
  end if;
  if v_movement_id is null then
    raise exception 'ไม่พบ movement หลังเบิก WIP';
  end if;

  insert into public.production_wip_can_issue_details (
    movement_id,
    issue_purpose,
    recipient_note
  ) values (
    v_movement_id,
    v_purpose,
    nullif(trim(p_recipient_note), '')
  )
  on conflict (movement_id) do nothing;

  return v_result || jsonb_build_object(
    'movementId', v_movement_id,
    'issuePurpose', v_purpose
  );
end;
$$;

revoke all on function public.issue_wip_cans_other_atomic(text,text,uuid,text,text,integer,date,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.issue_wip_cans_other_atomic(text,text,uuid,text,text,integer,date,uuid,text,text,text)
  to service_role;
