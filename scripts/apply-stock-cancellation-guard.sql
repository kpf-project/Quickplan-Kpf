begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Abort rather than overwrite an existing, potentially different installation.
do $$ begin
if to_regprocedure('public.guard_stock_issue_cancellation_children()') is not null then raise exception 'Guard already exists; inspect before applying'; end if;
end $$;
\i supabase/migrations/20260907030917_guard_stock_issue_cancellation_children.sql
do $$ begin
if not exists(select 1 from pg_trigger where tgrelid='public.production_stock_issue_items'::regclass and tgname='guard_stock_issue_cancellation_children' and tgenabled='O') then raise exception 'Guard verification failed'; end if;
end $$;
commit;
select tgname,tgenabled from pg_trigger where tgrelid='public.production_stock_issue_items'::regclass and tgname='guard_stock_issue_cancellation_children';
