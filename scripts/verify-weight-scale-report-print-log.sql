begin;

do $$
declare
  v_actor_id uuid;
  v_log_id bigint;
begin
  select id into v_actor_id from auth.users order by created_at limit 1;
  if v_actor_id is null then
    raise exception 'No authenticated user is available for verification';
  end if;

  insert into public.audit_logs (actor_id, action, target_table, metadata)
  values (
    v_actor_id,
    'production.weight_scale.report.print.verify',
    'production_weight_receipts',
    jsonb_build_object(
      'requestId', 'a7298803-6e13-4f2e-a0ef-d70bc22d88b8',
      'itemStatus', 'available',
      'requestedStart', 10,
      'requestedEnd', 20
    )
  )
  returning id into v_log_id;

  if not exists (
    select 1
    from public.audit_logs
    where id = v_log_id
      and action = 'production.weight_scale.report.print.verify'
      and metadata ->> 'itemStatus' = 'available'
  ) then
    raise exception 'Weight-scale print audit verification failed';
  end if;
end
$$;

rollback;

select 'weight-scale print audit insert verified and rolled back';
