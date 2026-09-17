create table if not exists public.production_fg_wip_waste_barcode_counters (
  counter_date date primary key,
  next_value integer not null check (next_value >= 1),
  updated_at timestamptz not null default now()
);

alter table public.production_fg_wip_waste_barcode_counters enable row level security;
revoke all on public.production_fg_wip_waste_barcode_counters from anon, authenticated;
grant select, insert, update on public.production_fg_wip_waste_barcode_counters to service_role;

create or replace function public.next_fg_wip_waste_barcode(p_production_date date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l_next_value integer;
begin
  if p_production_date is null then
    raise exception 'production date is required';
  end if;

  insert into public.production_fg_wip_waste_barcode_counters as counter (
    counter_date,
    next_value,
    updated_at
  )
  values (p_production_date, 1, now())
  on conflict (counter_date) do update
  set next_value = counter.next_value + 1,
      updated_at = now()
  returning counter.next_value into l_next_value;

  if l_next_value > 999 then
    raise exception 'waste barcode sequence exceeded 999 records for %', p_production_date;
  end if;

  return 'WST' || to_char(p_production_date, 'DDMMYY') || lpad(l_next_value::text, 3, '0');
end;
$$;

revoke all on function public.next_fg_wip_waste_barcode(date) from public, anon, authenticated;
grant execute on function public.next_fg_wip_waste_barcode(date) to service_role;

comment on table public.production_fg_wip_waste_barcode_counters is
  'Atomic daily counter for WSTDDMMYYXXX waste barcodes.';
