-- User-run only. KP13 pails use the existing WIP ledger; historical balances are never copied.
begin;
create table if not exists public.production_packing_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_id uuid not null references public.profiles(id),
  department_id uuid not null references public.production_departments(id),
  work_date date not null,
  lot_no text not null,
  product_code text not null references public.products_cache(sku_code),
  product_name text not null,
  image_url text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.production_packing_line_stock (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.production_packing_documents(id),
  department_id uuid not null references public.production_departments(id),
  product_code text not null,
  work_date date not null,
  lot_no text not null,
  unit_code text not null check(unit_code in ('sachet','pack','pail','carton','kg')),
  unit_label text not null,
  unit_version text not null,
  quantity numeric(12,3) not null check(quantity > 0),
  remaining numeric(12,3) not null check(remaining >= 0 and remaining <= quantity),
  unique(document_id,unit_code)
);
create table if not exists public.production_packing_source_uses (
  document_id uuid not null references public.production_packing_documents(id),
  source_id uuid not null,
  source_kind text not null check(source_kind in ('packing','legacy_wip','legacy_opening')),
  stock_id uuid references public.production_packing_line_stock(id),
  quantity numeric(12,3) not null check(quantity > 0),
  primary key(document_id,source_kind,source_id),
  check ((source_kind='packing' and stock_id=source_id) or (source_kind<>'packing' and stock_id is null))
);
create index if not exists packing_documents_daily on public.production_packing_documents(department_id,work_date,created_at desc);
create index if not exists packing_stock_available on public.production_packing_line_stock(department_id,product_code,work_date) where remaining > 0;
alter table public.production_packing_documents enable row level security;
alter table public.production_packing_line_stock enable row level security;
alter table public.production_packing_source_uses enable row level security;
revoke all on public.production_packing_documents, public.production_packing_line_stock, public.production_packing_source_uses from public, anon, authenticated, service_role;
grant select,insert on public.production_packing_documents, public.production_packing_source_uses to service_role;
grant select,insert,update on public.production_packing_line_stock to service_role;
-- The existing pail receipt ledger now distinguishes an opening from a packing closing receipt.
alter table public.production_wip_opening_balance_batches
  add column if not exists packing_document_id uuid unique references public.production_packing_documents(id);
grant update(packing_document_id) on public.production_wip_opening_balance_batches to service_role;

-- One read model over the original pail ledgers and the new, non-pail balances.
create or replace function public.packing_workspace_sources(p_department_id uuid,p_product_code text,p_date date)
returns table(id uuid,product_code text,lot_no text,unit_code text,unit_label text,remaining numeric,
  work_date date,unit_version text,source_kind text,source_document_id uuid,barcode text)
language sql stable security invoker set search_path=pg_catalog,public as $$
  select s.id,s.product_code,s.lot_no,s.unit_code,s.unit_label,s.remaining,s.work_date,s.unit_version,
    'packing'::text,s.document_id,null::text
  from public.production_packing_line_stock s
  where s.department_id=p_department_id and s.product_code=p_product_code and s.work_date<=p_date and s.remaining>0
  union all
  select (array_agg(m.id order by m.movement_date,m.created_at,m.id) filter(where m.quantity_in>0))[1],
    upper(trim(m.product_code)),trim(m.lot_no),'pail','ปี๊บ',sum(case when m.movement_date<=p_date then m.quantity_in else 0 end-m.quantity_out)::numeric,
    min(m.movement_date) filter(where m.quantity_in>0),null,'legacy_wip',
    (array_agg(m.document_id order by m.movement_date,m.created_at,m.id) filter(where m.quantity_in>0))[1],upper(trim(m.barcode))
  from public.production_wip_can_movements m
  where upper(trim(m.product_code))=p_product_code
    and exists(select 1 from public.production_departments d where d.id=p_department_id and d.code='KP13')
  group by upper(trim(m.product_code)),trim(m.lot_no),upper(trim(m.barcode))
  having sum(case when m.movement_date<=p_date then m.quantity_in else 0 end-m.quantity_out)>0 and min(m.movement_date) filter(where m.quantity_in>0)<=p_date
  union all
  select (array_agg(m.id order by m.movement_date,m.created_at,m.id) filter(where m.quantity_in>0))[1],
    upper(trim(m.product_code)),trim(m.lot_no),'pail','ปี๊บ',sum(case when m.movement_date<=p_date then m.quantity_in else 0 end-m.quantity_out)::numeric,
    min(m.movement_date) filter(where m.quantity_in>0),null,'legacy_opening',null::uuid,upper(trim(m.barcode))
  from public.production_wip_opening_balance_movements m
  where upper(trim(m.product_code))=p_product_code
    and exists(select 1 from public.production_departments d where d.id=p_department_id and d.code='KP13')
  group by upper(trim(m.product_code)),trim(m.lot_no),upper(trim(m.barcode))
  having sum(case when m.movement_date<=p_date then m.quantity_in else 0 end-m.quantity_out)>0 and min(m.movement_date) filter(where m.quantity_in>0)<=p_date
$$;
revoke all on function public.packing_workspace_sources(uuid,text,date) from public,anon,authenticated;
grant execute on function public.packing_workspace_sources(uuid,text,date) to service_role;

-- Server validates fresh action permission and ERP units. Only its service role can execute.
create or replace function public.record_packing_workspace(
  p_request_id uuid,p_actor_id uuid,p_department_id uuid,p_product_code text,p_work_date date,
  p_lot_no text,p_product_name text,p_image_url text,p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = pg_catalog,public as $$
declare
  v_document public.production_packing_documents;
  v_stock public.production_packing_line_stock;
  v_legacy record;
  v_issue jsonb;
  v_receipt jsonb;
  v_is_kp13 boolean;
  v_unit jsonb; v_source jsonb; v_qty numeric; v_code text;
begin
  if p_request_id is null or p_work_date is null or p_work_date > (now() at time zone 'Asia/Bangkok')::date
    or p_lot_no <> to_char(p_work_date,'DDMMYY')
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'units') is distinct from 'array'
    or jsonb_typeof(p_payload->'closing') is distinct from 'object'
    or jsonb_typeof(p_payload->'produced') is distinct from 'object'
    or jsonb_typeof(p_payload->'sources') is distinct from 'array'
    or p_payload->>'productCode' is distinct from p_product_code
    or p_payload->>'departmentId' is distinct from p_department_id::text
    or p_payload->>'workDate' is distinct from p_work_date::text then
    raise exception 'Invalid packing input' using errcode='22023';
  end if;
  if jsonb_array_length(p_payload->'units') not between 1 and 5 or jsonb_array_length(p_payload->'sources') > 100
    or nullif(p_payload->>'unitVersion','') is null then raise exception 'Invalid packing units' using errcode='22023'; end if;
  perform 1 from public.profiles where id=p_actor_id and is_active=true;
  if not found then raise exception 'Inactive actor' using errcode='42501'; end if;
  perform 1 from public.production_departments where id=p_department_id and is_active=true and deleted_at is null;
  if not found then raise exception 'Inactive department' using errcode='42501'; end if;
  -- Admins are permitted by the server, but all writes still require a mapped active product.
  perform 1 from public.production_department_products m join public.products_cache p on p.sku_code=m.sku_code
    where m.department_id=p_department_id and m.sku_code=p_product_code and p.is_active=true;
  if not found then raise exception 'Product outside department' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('packing-request:'||p_request_id::text,0));
  select * into v_document from public.production_packing_documents where request_id=p_request_id;
  if found then
    if v_document.actor_id<>p_actor_id or v_document.department_id<>p_department_id or v_document.payload<>p_payload then
      raise exception 'Request reused with different input' using errcode='23505';
    end if;
    return jsonb_build_object('id',v_document.id,'replayed',true);
  end if;
  insert into public.production_packing_documents(request_id,actor_id,department_id,work_date,lot_no,product_code,product_name,image_url,payload)
    values(p_request_id,p_actor_id,p_department_id,p_work_date,p_lot_no,p_product_code,p_product_name,p_image_url,p_payload) returning * into v_document;
  select code='KP13' into v_is_kp13 from public.production_departments where id=p_department_id;
  -- Stable source order prevents two multi-LOT requests taking locks in opposite order.
  for v_source in select value from jsonb_array_elements(p_payload->'sources') order by value->>'id' loop
    v_qty := (v_source->>'quantity')::numeric;
    if v_qty is null or v_qty<=0 or v_qty>999999999 or v_qty<>round(v_qty,3) then raise exception 'Invalid source quantity' using errcode='22023'; end if;
    if v_source->>'sourceKind' in ('legacy_wip','legacy_opening') then
      if not v_is_kp13 or trunc(v_qty)<>v_qty
        or not exists(select 1 from jsonb_array_elements(p_payload->'units') u where u->>'code'='pail') then
        raise exception 'Legacy pails outside department or units' using errcode='22023';
      end if;
      select * into v_legacy from public.packing_workspace_sources(p_department_id,p_product_code,p_work_date)
        where id=(v_source->>'id')::uuid and source_kind=v_source->>'sourceKind';
      if not found then raise exception 'Legacy source changed; reload balances' using errcode='22023'; end if;
      perform pg_advisory_xact_lock(hashtextextended(p_product_code||'|'||v_legacy.barcode||'|'||v_legacy.lot_no,0));
      -- Re-read eligible receipts after waiting; future-dated receipts must not fund a historical issue.
      select * into v_legacy from public.packing_workspace_sources(p_department_id,p_product_code,p_work_date)
        where id=(v_source->>'id')::uuid and source_kind=v_source->>'sourceKind';
      if not found or v_legacy.remaining<v_qty then raise exception 'Legacy source changed; reload balances' using errcode='22023'; end if;
      -- These are the same advisory-locked writers used by the old page; the outer transaction owns rollback.
      if v_legacy.source_kind='legacy_wip' then
        v_issue := public.issue_wip_cans_atomic('packing:'||p_request_id||':'||v_legacy.id,
          'PK-'||p_request_id||'-'||v_legacy.id,v_legacy.source_document_id,v_legacy.barcode,v_legacy.lot_no,
          v_qty::integer,p_work_date,p_actor_id,'เบิกผ่านหน้าบรรจุหลายหน่วย');
      else
        v_issue := public.issue_wip_opening_cans_atomic('packing:'||p_request_id||':'||v_legacy.id,
          'PK-'||p_request_id||'-'||v_legacy.id,v_legacy.id,v_legacy.barcode,v_legacy.lot_no,
          v_qty::integer,p_work_date,p_actor_id,'เบิกผ่านหน้าบรรจุหลายหน่วย','production_use',null);
      end if;
      if (v_issue->>'duplicated')::boolean then
        raise exception 'Source request already exists outside this document' using errcode='23505';
      end if;
      insert into public.production_packing_source_uses(document_id,source_id,source_kind,quantity)
        values(v_document.id,v_legacy.id,v_legacy.source_kind,v_qty);
      continue;
    end if;
    select * into v_stock from public.production_packing_line_stock where id=(v_source->>'id')::uuid for update;
    if not found or v_stock.department_id<>p_department_id or v_stock.product_code<>p_product_code
      or v_stock.work_date>p_work_date or v_stock.unit_version<>p_payload->>'unitVersion'
      or v_stock.remaining<v_qty or (v_stock.unit_code<>'kg' and trunc(v_qty)<>v_qty) then
      raise exception 'Source stock changed or incompatible; reload balances' using errcode='22023';
    end if;
    insert into public.production_packing_source_uses(document_id,source_id,source_kind,stock_id,quantity)
      values(v_document.id,v_stock.id,'packing',v_stock.id,v_qty);
    update public.production_packing_line_stock set remaining=remaining-v_qty where id=v_stock.id;
  end loop;
  for v_unit in select value from jsonb_array_elements(p_payload->'units') loop
    v_code := v_unit->>'code';
    if v_code is null or v_code not in ('sachet','pack','pail','carton','kg') or (v_unit->>'factor') is null or (v_unit->>'factor')::numeric<=0 then raise exception 'Invalid unit' using errcode='22023'; end if;
    v_qty := coalesce(nullif(p_payload->'closing'->>v_code,''),'0')::numeric;
    if v_qty<0 or v_qty>999999999 or v_qty<>round(v_qty,3) or (v_code<>'kg' and trunc(v_qty)<>v_qty) then
      raise exception 'Invalid closing quantity' using errcode='22023';
    end if;
    if v_qty>0 then
      if v_is_kp13 and v_code='pail' then
        -- A new receipt in the existing ledger, not a second stock balance in the new table.
        v_receipt := public.record_wip_opening_balance_batch('packing-closing:'||p_request_id,p_work_date,
          jsonb_build_array(jsonb_build_object('productCode',p_product_code,'productName',p_product_name,
            'barcode',p_product_code,'lotNo',p_lot_no,'quantity',v_qty,
            'notes','ยอดค้างปลายวันจากบรรจุ '||v_document.id)),p_actor_id,null);
        if (v_receipt->>'duplicated')::boolean then
          raise exception 'Closing receipt already exists outside this document' using errcode='23505';
        end if;
        update public.production_wip_opening_balance_batches set packing_document_id=v_document.id
          where id=(v_receipt->>'batchId')::uuid;
        continue;
      end if;
      insert into public.production_packing_line_stock(document_id,department_id,product_code,work_date,lot_no,unit_code,unit_label,unit_version,quantity,remaining)
        values(v_document.id,p_department_id,p_product_code,p_work_date,p_lot_no,v_code,v_unit->>'label',p_payload->>'unitVersion',v_qty,v_qty);
    end if;
  end loop;
  return jsonb_build_object('id',v_document.id,'replayed',false);
end $$;
revoke all on function public.record_packing_workspace(uuid,uuid,uuid,text,date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_packing_workspace(uuid,uuid,uuid,text,date,text,text,text,jsonb) to service_role;
commit;
