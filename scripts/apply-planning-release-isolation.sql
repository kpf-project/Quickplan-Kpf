begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.production_schedule_plans add column if not exists published_snapshot jsonb;
alter table public.production_schedule_plans add column if not exists published_revision bigint not null default 0;
alter table public.production_master_plans add column if not exists published_plan_rows jsonb;
alter table public.production_master_plans add column if not exists published_revision bigint not null default 0;
alter table public.production_sub_plans add column if not exists confirmed_snapshot jsonb;
alter table public.production_sub_plans add column if not exists confirmed_revision bigint not null default 0;
alter table public.production_requisition_preview_drafts add column if not exists source_revision text;

create or replace function public.capture_schedule_publish_snapshot()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status='published' then
    new.published_snapshot=jsonb_build_object(
      'plan',to_jsonb(new)-'published_snapshot'-'published_revision',
      'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.section_def_id,r.day_key,r.display_order)
        from public.production_schedule_rows r where r.plan_id=new.id),'[]'::jsonb));
    new.published_revision=coalesce(old.published_revision,0)+1;
  end if;
  return new;
end $$;
revoke all on function public.capture_schedule_publish_snapshot() from public,anon,authenticated;
grant execute on function public.capture_schedule_publish_snapshot() to service_role;
drop trigger if exists capture_schedule_publish_snapshot on public.production_schedule_plans;
create trigger capture_schedule_publish_snapshot before insert or update of status
on public.production_schedule_plans for each row execute function public.capture_schedule_publish_snapshot();

create or replace function public.capture_subplan_confirm_snapshot()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status='confirmed' then
    new.confirmed_snapshot=coalesce((select jsonb_agg(to_jsonb(p) order by p.plan_id)
      from public.production_plan_status p
      where p.master_plan_no=new.master_plan_no and p.owner_department_id=new.department_id
      and p.plan_kind='sub' and p.confirmed_at is not null),'[]'::jsonb);
    new.confirmed_revision=coalesce(old.confirmed_revision,0)+1;
  end if;
  return new;
end $$;
revoke all on function public.capture_subplan_confirm_snapshot() from public,anon,authenticated;
grant execute on function public.capture_subplan_confirm_snapshot() to service_role;
drop trigger if exists capture_subplan_confirm_snapshot on public.production_sub_plans;
create trigger capture_subplan_confirm_snapshot before insert or update of status
on public.production_sub_plans for each row execute function public.capture_subplan_confirm_snapshot();

create or replace function public.capture_master_publish_rows()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.status='published' then
    new.published_plan_rows=coalesce((select jsonb_agg(to_jsonb(p)
      ||jsonb_build_object('production_departments',jsonb_build_object('code',d.code,'name',d.name)) order by p.plan_id)
      from public.production_plan_status p left join public.production_departments d on d.id=p.owner_department_id
      where (p.master_plan_no=new.master_plan_no or p.plan_group_id=new.master_plan_no) and p.plan_kind='main'),'[]'::jsonb);
    new.published_revision=coalesce(old.published_revision,0)+1;
  end if;
  return new;
end $$;
revoke all on function public.capture_master_publish_rows() from public,anon,authenticated;
grant execute on function public.capture_master_publish_rows() to service_role;
drop trigger if exists capture_master_publish_rows on public.production_master_plans;
create trigger capture_master_publish_rows before insert or update of status
on public.production_master_plans for each row execute function public.capture_master_publish_rows();

update public.production_schedule_plans set status=status
where status='published' and published_snapshot is null;
update public.production_sub_plans set status=status
where status='confirmed' and confirmed_at is not null and confirmed_snapshot is null;
update public.production_master_plans set status=status
where status='published' and published_plan_rows is null;

select 'main',count(*),sum(jsonb_array_length(published_snapshot->'rows'))
from public.production_schedule_plans where published_snapshot is not null
union all
select 'sub',count(*),sum(jsonb_array_length(confirmed_snapshot))
from public.production_sub_plans where confirmed_snapshot is not null;

\if :APPLY
commit;
\else
do $$
declare m public.production_schedule_plans; s public.production_sub_plans;
  r public.production_schedule_rows; p public.production_plan_status;
begin
  select * into m from public.production_schedule_plans where published_snapshot is not null limit 1;
  if m.id is null then raise exception 'No published schedule available for lifecycle test'; end if;
  select * into r from public.production_schedule_rows where plan_id=m.id limit 1;
  if r.id is null then raise exception 'No schedule row available for lifecycle test'; end if;
  update public.production_schedule_rows set display_order=coalesce(display_order,0)+1 where id=r.id;
  update public.production_schedule_plans set status='draft' where id=m.id;
  if exists(select 1 from public.production_schedule_plans where id=m.id
    and (published_snapshot is distinct from m.published_snapshot or published_revision<>m.published_revision))
    then raise exception 'Draft overwrote published release'; end if;
  update public.production_schedule_plans set status='published' where id=m.id;
  if not exists(select 1 from public.production_schedule_plans where id=m.id and published_revision=m.published_revision+1)
    then raise exception 'Publish did not advance revision'; end if;
  if not exists(select 1 from public.production_schedule_plans h, jsonb_array_elements(h.published_snapshot->'rows') j
    where h.id=m.id and j->>'id'=r.id::text and (j->>'display_order')::integer=coalesce(r.display_order,0)+1)
    then raise exception 'Publish did not capture edited row'; end if;
  select * into s from public.production_sub_plans where jsonb_array_length(confirmed_snapshot)>0 limit 1;
  if s.department_id is null then raise exception 'No confirmed subplan available for lifecycle test'; end if;
  select * into p from public.production_plan_status where master_plan_no=s.master_plan_no
    and owner_department_id=s.department_id and plan_kind='sub' and confirmed_at is not null limit 1;
  if p.plan_id is null then raise exception 'No subplan row available for lifecycle test'; end if;
  update public.production_plan_status set planned_qty=coalesce(planned_qty,0)+1 where plan_id=p.plan_id;
  update public.production_sub_plans set status='draft' where master_plan_no=s.master_plan_no and department_id=s.department_id;
  if exists(select 1 from public.production_sub_plans where master_plan_no=s.master_plan_no and department_id=s.department_id
    and (confirmed_snapshot is distinct from s.confirmed_snapshot or confirmed_revision<>s.confirmed_revision))
    then raise exception 'Draft overwrote confirmed release'; end if;
  update public.production_sub_plans set status='confirmed' where master_plan_no=s.master_plan_no and department_id=s.department_id;
  if not exists(select 1 from public.production_sub_plans where master_plan_no=s.master_plan_no and department_id=s.department_id
    and confirmed_revision=s.confirmed_revision+1)
    then raise exception 'Confirmation did not advance revision'; end if;
  if not exists(select 1 from public.production_sub_plans h, jsonb_array_elements(h.confirmed_snapshot) j
    where h.master_plan_no=s.master_plan_no and h.department_id=s.department_id
    and j->>'plan_id'=p.plan_id::text and (j->>'planned_qty')::numeric=coalesce(p.planned_qty,0)+1)
    then raise exception 'Confirmation did not capture edited row'; end if;
  raise notice 'Release lifecycle checks passed; all test changes roll back';
end $$;
rollback;
\endif
