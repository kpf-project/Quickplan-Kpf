begin;
set local lock_timeout='5s';
update public.production_work_centers
set consolidate_requisition_preview_by_date=false,updated_at=now()
where deleted_at is null and is_active=true
  and code in ('BIS02','BIS03','BIS04','BIS05','BIS06','BIS07','BIS08','KP40-1','KP40-2','KP41-1','KP41-2','MIX-KP13','MIX-KP41','SUG01')
  and consolidate_requisition_preview_by_date=true;
select code,consolidate_requisition_preview_by_date from public.production_work_centers where deleted_at is null order by code;
\if :APPLY
commit;
\else
rollback;
\endif
