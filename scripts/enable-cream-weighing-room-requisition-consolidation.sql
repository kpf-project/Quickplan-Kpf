begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

do $$
begin
  if (
    select count(*)
    from public.production_work_centers wc
    join public.production_departments d on d.id = wc.department_id
    where wc.id = 'fb6cfd6f-22b8-42ef-b467-e31e82eaebd1'::uuid
      and wc.code = 'PRP01'
      and wc.name = 'ห้องชั่งสูตรตีครีม'
      and d.code = 'KP13'
      and wc.deleted_at is null
      and d.deleted_at is null
  ) <> 1 then
    raise exception 'PRP01 cream-weighing work-center precondition failed';
  end if;
end;
$$;

update public.production_work_centers
set
  consolidate_requisition_preview_by_date = true,
  updated_at = now()
where id = 'fb6cfd6f-22b8-42ef-b467-e31e82eaebd1'::uuid
  and consolidate_requisition_preview_by_date is distinct from true;

do $$
begin
  if not exists (
    select 1
    from public.production_work_centers
    where id = 'fb6cfd6f-22b8-42ef-b467-e31e82eaebd1'::uuid
      and consolidate_requisition_preview_by_date = true
  ) then
    raise exception 'PRP01 requisition consolidation verification failed';
  end if;
end;
$$;

select
  code,
  name,
  consolidate_requisition_preview_by_date
from public.production_work_centers
where id = 'fb6cfd6f-22b8-42ef-b467-e31e82eaebd1'::uuid;

\if :APPLY
commit;
\else
rollback;
\endif
