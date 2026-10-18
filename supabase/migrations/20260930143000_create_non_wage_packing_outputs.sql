create table if not exists public.production_non_wage_packing_outputs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  work_date date not null,
  lot_no text not null,
  product_code text not null references public.products_cache(sku_code) on delete restrict,
  product_name_snapshot text not null,
  product_image_url_snapshot text,
  category_code text not null default '04',
  cartons integer not null,
  packs integer not null,
  sachets integer not null,
  packs_per_carton integer not null,
  sachets_per_pack integer not null,
  closing_packs integer not null default 0,
  closing_sachets integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint production_non_wage_outputs_lot_check check (lot_no ~ '^[0-9]{6}$'),
  constraint production_non_wage_outputs_quantity_check check (
    cartons >= 0 and packs >= 0 and sachets >= 0
    and packs_per_carton > 0 and sachets_per_pack > 0
    and closing_packs >= 0 and closing_sachets >= 0
  )
);

create table if not exists public.production_non_wage_packing_carryovers (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references public.production_non_wage_packing_outputs(id) on delete cascade,
  source_lot_no text not null,
  packs integer not null default 0,
  sachets integer not null default 0,
  created_at timestamptz not null default now(),
  constraint production_non_wage_carryovers_lot_check check (source_lot_no ~ '^[0-9]{6}$'),
  constraint production_non_wage_carryovers_quantity_check check (
    packs >= 0 and sachets >= 0 and (packs > 0 or sachets > 0)
  ),
  constraint production_non_wage_carryovers_output_lot_unique unique (output_id, source_lot_no)
);

create index if not exists production_non_wage_outputs_work_date_idx
  on public.production_non_wage_packing_outputs (work_date desc, created_at desc);

create index if not exists production_non_wage_outputs_product_idx
  on public.production_non_wage_packing_outputs (product_code, work_date desc);

alter table public.production_non_wage_packing_outputs enable row level security;
alter table public.production_non_wage_packing_carryovers enable row level security;

create or replace function public.create_non_wage_packing_output(
  p_output jsonb,
  p_carryovers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_output_id uuid;
begin
  select id into v_output_id
  from public.production_non_wage_packing_outputs
  where request_id = trim(p_output->>'request_id');

  if v_output_id is not null then
    return v_output_id;
  end if;

  insert into public.production_non_wage_packing_outputs (
    request_id, work_date, lot_no, product_code, product_name_snapshot,
    product_image_url_snapshot, category_code, cartons, packs, sachets,
    packs_per_carton, sachets_per_pack, closing_packs, closing_sachets, created_by
  ) values (
    trim(p_output->>'request_id'),
    (p_output->>'work_date')::date,
    trim(p_output->>'lot_no'),
    upper(trim(p_output->>'product_code')),
    trim(p_output->>'product_name'),
    nullif(trim(p_output->>'product_image_url'), ''),
    coalesce(nullif(trim(p_output->>'category_code'), ''), '04'),
    (p_output->>'cartons')::integer,
    (p_output->>'packs')::integer,
    (p_output->>'sachets')::integer,
    (p_output->>'packs_per_carton')::integer,
    (p_output->>'sachets_per_pack')::integer,
    coalesce((p_output->>'closing_packs')::integer, 0),
    coalesce((p_output->>'closing_sachets')::integer, 0),
    nullif(p_output->>'created_by', '')::uuid
  )
  returning id into v_output_id;

  insert into public.production_non_wage_packing_carryovers (
    output_id, source_lot_no, packs, sachets
  )
  select
    v_output_id,
    trim(item->>'lot_no'),
    coalesce((item->>'packs')::integer, 0),
    coalesce((item->>'sachets')::integer, 0)
  from jsonb_array_elements(coalesce(p_carryovers, '[]'::jsonb)) as item;

  return v_output_id;
end;
$$;

revoke all on function public.create_non_wage_packing_output(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_non_wage_packing_output(jsonb, jsonb)
  to service_role;
