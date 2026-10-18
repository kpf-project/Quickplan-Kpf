\set ON_ERROR_STOP on
begin;

create table if not exists central_scale.devices (
  point_id uuid primary key,
  is_active boolean not null default false,
  signing_key_hex text not null check (signing_key_hex ~ '^[0-9a-f]{64}$'),
  max_kg numeric not null check (max_kg > 0 and max_kg <= 1000000),
  resolution_kg numeric not null check (resolution_kg >= 0.001 and resolution_kg <= max_kg and resolution_kg = trunc(resolution_kg, 3)),
  created_at timestamptz not null default clock_timestamp()
);
alter table central_scale.devices enable row level security;
revoke all on central_scale.devices from public, anon, authenticated, service_role;
grant select, insert, update on central_scale.devices to service_role;

-- Private key material is returned only to the trusted server's service role.
create or replace function public.central_scale_device_profile(p_point_id uuid)
returns jsonb language sql security invoker
set search_path = pg_catalog, central_scale
as $function$
  select to_jsonb(d) from central_scale.devices d where point_id = p_point_id and is_active = true;
$function$;
revoke all on function public.central_scale_device_profile(uuid) from public, anon, authenticated;
grant execute on function public.central_scale_device_profile(uuid) to service_role;

\if :APPLY
commit;
\else
rollback;
\endif
