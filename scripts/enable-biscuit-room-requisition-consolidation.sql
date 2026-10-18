begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

do $$
begin
  if (
    select count(*)
    from public.production_work_centers wc
    join public.production_departments d on d.id = wc.department_id
    where wc.id = '1f50fe8c-86f8-45d6-ba07-eaf52bfe1436'::uuid
      and wc.code = 'BIS01'
      and wc.name = 'ห้องตีแป้งบิสกิต'
      and d.code = 'KP13'
      and wc.deleted_at is null
      and d.deleted_at is null
  ) <> 1 then
    raise exception 'BIS01 biscuit work-center precondition failed';
  end if;
end;
$$;

update public.production_work_centers
set
  consolidate_requisition_preview_by_date = true,
  updated_at = now()
where id = '1f50fe8c-86f8-45d6-ba07-eaf52bfe1436'::uuid
  and consolidate_requisition_preview_by_date is distinct from true;

do $$
begin
  if not exists (
    select 1
    from public.production_work_centers
    where id = '1f50fe8c-86f8-45d6-ba07-eaf52bfe1436'::uuid
      and consolidate_requisition_preview_by_date = true
  ) then
    raise exception 'BIS01 requisition consolidation verification failed';
  end if;
end;
$$;

select
  code,
  name,
  consolidate_requisition_preview_by_date
from public.production_work_centers
where id = '1f50fe8c-86f8-45d6-ba07-eaf52bfe1436'::uuid;

\if :APPLY
commit;
\else
rollback;
\endif
