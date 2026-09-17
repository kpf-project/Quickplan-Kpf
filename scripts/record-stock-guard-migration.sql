begin;
do $$ begin
if not exists(select 1 from pg_trigger where tgrelid='public.production_stock_issue_items'::regclass and tgname='guard_stock_issue_cancellation_children' and tgenabled='O') then raise exception 'Guard is not installed'; end if;
if exists(select 1 from supabase_migrations.schema_migrations where version='20260907030917') then raise exception 'Migration history already exists; inspect before changing'; end if;
end $$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20260907030917','guard_stock_issue_cancellation_children',array[]::text[]);
commit;
select version,name from supabase_migrations.schema_migrations where version='20260907030917';
