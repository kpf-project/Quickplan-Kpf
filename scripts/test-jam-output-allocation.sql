-- Add explicit output allocation without rewriting historical jam usage.
begin;
set local lock_timeout = '5s';
create temp table jam_allocation_test (id uuid default gen_random_uuid(), weight_kg numeric check(weight_kg>0));
alter table pg_temp.jam_allocation_test
  add column if not exists target_product_code text,
  add column if not exists target_product_name_snapshot text,
  add column if not exists request_id uuid,
  add column if not exists request_fingerprint text;
create unique index if not exists production_jam_usage_request_product_unique
  on pg_temp.jam_allocation_test (request_id, target_product_code)
  where request_id is not null;

-- New batches must always identify their output. Legacy unallocated rows remain valid.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='pg_temp.jam_allocation_test'::regclass and conname='production_jam_usage_target_batch_check') then
    alter table pg_temp.jam_allocation_test add constraint production_jam_usage_target_batch_check
      check ((request_id is null and target_product_code is null and target_product_name_snapshot is null and request_fingerprint is null)
        or (request_id is not null and nullif(btrim(target_product_code),'') is not null and nullif(btrim(target_product_name_snapshot),'') is not null and request_fingerprint is not null and request_fingerprint ~ '^[0-9a-f]{64}$'));
  end if;
end $$;
create or replace function pg_temp.guard_production_jam_usage_batch()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.request_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.request_id::text, 0));
    if exists (select 1 from pg_temp.jam_allocation_test
      where request_id = new.request_id and request_fingerprint is distinct from new.request_fingerprint) then
      raise exception using errcode = '23505', message = 'Jam request already exists with different allocations';
    end if;
  end if;
  return new;
end $$;
revoke all on function pg_temp.guard_production_jam_usage_batch() from public, anon, authenticated;
drop trigger if exists production_jam_usage_batch_guard on pg_temp.jam_allocation_test;
create trigger production_jam_usage_batch_guard before insert on pg_temp.jam_allocation_test
for each row execute function pg_temp.guard_production_jam_usage_batch();



do $$ begin
  insert into jam_allocation_test(weight_kg,request_id,target_product_code,target_product_name_snapshot,request_fingerprint) values
    (200,'68ef56c8-3836-450a-8194-2ada1074f095','WKB-0064','A',repeat('a',64)),
    (230,'68ef56c8-3836-450a-8194-2ada1074f095','WKB-0065','B',repeat('a',64));
  begin
    insert into jam_allocation_test(weight_kg,request_id,target_product_code,target_product_name_snapshot,request_fingerprint) values
      (200,'68ef56c8-3836-450a-8194-2ada1074f095','WKB-0064','A',repeat('a',64));
    raise exception 'Duplicate batch accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into jam_allocation_test(weight_kg,request_id,target_product_code,target_product_name_snapshot,request_fingerprint) values
      (200,'68ef56c8-3836-450a-8194-2ada1074f095','FG-NEW','C',repeat('b',64));
    raise exception 'Changed payload accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into jam_allocation_test(weight_kg,request_id,target_product_code,target_product_name_snapshot,request_fingerprint) values
      (20,gen_random_uuid(),'FG-X','X',repeat('c',64)),(-1,gen_random_uuid(),'FG-Y','Y',repeat('c',64));
    raise exception 'Invalid batch accepted';
  exception when check_violation then null;
  end;
  begin
    insert into jam_allocation_test(weight_kg,request_id,target_product_code,target_product_name_snapshot) values
      (10,gen_random_uuid(),'FG-NULL','N');
    raise exception 'Missing fingerprint accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from jam_allocation_test) <> 2 or (select sum(weight_kg) from jam_allocation_test) <> 430 then
    raise exception 'Atomicity verification failed';
  end if;
end $$;
select 'passed: atomic insert, unique retry key, changed-payload rejection, 430 kg total';
rollback;
