-- SQL Editor compatible. New central opening only: does not migrate or modify legacy stock.
begin;
create table if not exists public.production_wip_opening_scopes (
  department_id uuid primary key references public.production_departments(id),
  opening_date date not null,
  created_at timestamptz not null default now()
);
create table if not exists public.production_wip_opening_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  department_id uuid not null references public.production_wip_opening_scopes(department_id),
  opening_date date not null,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.production_wip_opening_entries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.production_wip_opening_documents(id),
  department_id uuid not null references public.production_departments(id),
  product_code text not null,
  product_name text not null,
  lot_no text not null check (length(lot_no) between 1 and 100),
  unit text not null check (unit in ('sachet','pack','pail','kg')),
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 999999999.999 and (unit = 'kg' or quantity = trunc(quantity))),
  notes text not null default '' check (length(notes) <= 500),
  unique (department_id, product_code, lot_no, unit)
);
create index if not exists production_wip_opening_documents_history on public.production_wip_opening_documents(department_id, created_at desc, id);
create index if not exists production_wip_opening_entries_document on public.production_wip_opening_entries(document_id);
alter table public.production_wip_opening_scopes enable row level security;
alter table public.production_wip_opening_documents enable row level security;
alter table public.production_wip_opening_entries enable row level security;
revoke all on public.production_wip_opening_scopes, public.production_wip_opening_documents, public.production_wip_opening_entries from public, anon, authenticated, service_role;
grant select on public.production_wip_opening_scopes, public.production_wip_opening_documents, public.production_wip_opening_entries to service_role;

insert into public.permissions(perm_key,label,path,group_key) values
  ('wip-opening-view','ดูยอดตั้งต้น WIP กลาง','/production-line/fg-wip?capability=wip-opening-view','production-line'),
  ('wip-opening-manage','บันทึกยอดตั้งต้น WIP กลาง','/production-line/fg-wip?capability=wip-opening-manage','production-line')
on conflict (perm_key) do nothing;

-- The only writer. Server supplies a verified actor; no direct browser/table writes.
create or replace function public.record_central_wip_opening(
  p_request_id uuid, p_actor_id uuid, p_department_id uuid, p_opening_date date, p_entries jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $function$
declare
  v_admin boolean;
  v_document public.production_wip_opening_documents;
  v_entry jsonb;
  v_name text;
  v_date date;
  v_quantity numeric;
begin
  if p_request_id is null or p_actor_id is null or p_department_id is null or p_opening_date is null
    or p_opening_date > (current_timestamp at time zone 'Asia/Bangkok')::date
    or jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Invalid opening input' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 200 then
    raise exception 'Opening batch must have 1-200 unit entries' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_actor_id and is_active = true for share;
  if not found then raise exception 'Inactive actor' using errcode = '42501'; end if;
  perform 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_actor_id and r.role_key = 'admin' for share of ur, r;
  v_admin := found;
  if not v_admin then
    perform 1 from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_actor_id and p.perm_key = 'wip-opening-manage' for share of ur, rp, p;
    if not found then raise exception 'Opening permission required' using errcode = '42501'; end if;
    perform 1 from public.production_department_users where user_id = p_actor_id
      and department_id = p_department_id and role = 'editor' for share;
    if not found then raise exception 'Department editor required' using errcode = '42501'; end if;
  end if;
  perform 1 from public.production_departments where id = p_department_id and is_active = true and deleted_at is null for share;
  if not found then raise exception 'Inactive department' using errcode = '42501'; end if;
  -- Serialise only this department; different departments remain independent.
  perform pg_advisory_xact_lock(hashtextextended('wip-opening:' || p_department_id::text, 0));
  select * into v_document from public.production_wip_opening_documents where request_id = p_request_id;
  if found then
    if v_document.actor_id <> p_actor_id or v_document.department_id <> p_department_id
      or v_document.opening_date <> p_opening_date or v_document.payload <> p_entries then
      raise exception 'Request already used with different data' using errcode = '23505';
    end if;
    return jsonb_build_object('documentId',v_document.id,'replayed',true);
  end if;
  insert into public.production_wip_opening_scopes(department_id,opening_date) values(p_department_id,p_opening_date) on conflict do nothing;
  select opening_date into v_date from public.production_wip_opening_scopes where department_id = p_department_id;
  if v_date <> p_opening_date then raise exception 'Department opening date already fixed' using errcode = '23505'; end if;
  insert into public.production_wip_opening_documents(request_id,actor_id,department_id,opening_date,payload)
    values(p_request_id,p_actor_id,p_department_id,p_opening_date,p_entries) returning * into v_document;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_entry) is distinct from 'object'
      or coalesce(v_entry->>'unit','') not in ('sachet','pack','pail','kg')
      or coalesce(v_entry->>'productCode','') !~ '^[A-Z0-9][A-Z0-9._/-]{0,99}$'
      or length(coalesce(v_entry->>'lotNo','')) not between 1 and 100
      or v_entry->>'lotNo' <> upper(btrim(v_entry->>'lotNo'))
      or v_entry->>'lotNo' ~ '[[:cntrl:]]'
      or coalesce(v_entry->>'quantity','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
      or length(coalesce(v_entry->>'notes','')) > 500 then
      raise exception 'Invalid opening entry' using errcode = '22023';
    end if;
    v_quantity := (v_entry->>'quantity')::numeric;
    if v_quantity <= 0 or ((v_entry->>'unit') <> 'kg' and v_quantity <> trunc(v_quantity)) then
      raise exception 'Invalid unit quantity' using errcode = '22023';
    end if;
    perform 1 from public.production_department_products where department_id = p_department_id and sku_code = v_entry->>'productCode' for share;
    if not found then raise exception 'Product not assigned to department' using errcode = '42501'; end if;
    select sku_name into v_name from public.products_cache where sku_code = v_entry->>'productCode' and iccat_code = '03' for share;
    if not found then raise exception 'WIP product required' using errcode = '22023'; end if;
    insert into public.production_wip_opening_entries(document_id,department_id,product_code,product_name,lot_no,unit,quantity,notes)
      values(v_document.id,p_department_id,v_entry->>'productCode',v_name,v_entry->>'lotNo',v_entry->>'unit',v_quantity,coalesce(v_entry->>'notes',''));
  end loop;
  return jsonb_build_object('documentId',v_document.id,'replayed',false);
end;
$function$;
revoke all on function public.record_central_wip_opening(uuid,uuid,uuid,date,jsonb) from public, anon, authenticated;
grant execute on function public.record_central_wip_opening(uuid,uuid,uuid,date,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
