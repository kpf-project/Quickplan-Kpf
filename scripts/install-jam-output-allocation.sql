-- Add explicit output allocation without rewriting historical jam usage.
begin;
set local lock_timeout = '5s';
alter table public.production_jam_usage_entries
  add column if not exists target_product_code text,
  add column if not exists target_product_name_snapshot text,
  add column if not exists request_id uuid,
  add column if not exists request_fingerprint text;
create unique index if not exists production_jam_usage_request_product_unique
  on public.production_jam_usage_entries (request_id, target_product_code)
  where request_id is not null;

-- New batches must always identify their output. Legacy unallocated rows remain valid.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.production_jam_usage_entries'::regclass and conname='production_jam_usage_target_batch_check') then
    alter table public.production_jam_usage_entries add constraint production_jam_usage_target_batch_check
      check ((request_id is null and target_product_code is null and target_product_name_snapshot is null and request_fingerprint is null)
        or (request_id is not null and nullif(btrim(target_product_code),'') is not null and nullif(btrim(target_product_name_snapshot),'') is not null and request_fingerprint is not null and request_fingerprint ~ '^[0-9a-f]{64}$'));
  end if;
end $$;
create or replace function public.guard_production_jam_usage_batch()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.request_id::text, 0));
    if exists (select 1 from public.production_jam_usage_entries
      where request_id = new.request_id and request_fingerprint is distinct from new.request_fingerprint) then
      raise exception using errcode = '23505', message = 'Jam request already exists with different allocations';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_production_jam_usage_batch() from public, anon, authenticated;
drop trigger if exists production_jam_usage_batch_guard on public.production_jam_usage_entries;
create trigger production_jam_usage_batch_guard before insert on public.production_jam_usage_entries
for each row execute function public.guard_production_jam_usage_batch();
notify pgrst, 'reload schema';
commit;
