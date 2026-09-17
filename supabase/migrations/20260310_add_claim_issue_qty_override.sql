begin;

alter table public.production_material_claims_daily
  add column if not exists override_issue_qty numeric;

alter table public.production_material_claims_weekly
  add column if not exists override_issue_qty numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_material_claims_daily_override_issue_qty_check'
  ) then
    alter table public.production_material_claims_daily
      add constraint production_material_claims_daily_override_issue_qty_check
      check (override_issue_qty is null or override_issue_qty >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_material_claims_weekly_override_issue_qty_check'
  ) then
    alter table public.production_material_claims_weekly
      add constraint production_material_claims_weekly_override_issue_qty_check
      check (override_issue_qty is null or override_issue_qty >= 0);
  end if;
end
$$;

alter table public.production_material_claim_events
  drop constraint if exists production_material_claim_events_action_check;

alter table public.production_material_claim_events
  add constraint production_material_claim_events_action_check
  check (action in ('claim', 'release', 'reassign', 'auto_assign', 'update_qty'));

commit;
