begin;

-- Foreign-key supporting indexes for new claim workflow tables
create index if not exists production_material_claims_daily_material_idx
  on public.production_material_claims_daily (material_sku_code);
create index if not exists production_material_claims_daily_claimed_by_idx
  on public.production_material_claims_daily (claimed_by);
create index if not exists production_material_claims_daily_released_by_idx
  on public.production_material_claims_daily (released_by);
create index if not exists production_material_claims_daily_created_by_idx
  on public.production_material_claims_daily (created_by);
create index if not exists production_material_claims_daily_updated_by_idx
  on public.production_material_claims_daily (updated_by);

create index if not exists production_material_claims_weekly_material_idx
  on public.production_material_claims_weekly (material_sku_code);
create index if not exists production_material_claims_weekly_claimed_by_idx
  on public.production_material_claims_weekly (claimed_by);
create index if not exists production_material_claims_weekly_released_by_idx
  on public.production_material_claims_weekly (released_by);
create index if not exists production_material_claims_weekly_created_by_idx
  on public.production_material_claims_weekly (created_by);
create index if not exists production_material_claims_weekly_updated_by_idx
  on public.production_material_claims_weekly (updated_by);

create index if not exists production_material_claim_events_from_department_idx
  on public.production_material_claim_events (from_department_id, bucket_date);
create index if not exists production_material_claim_events_to_department_idx
  on public.production_material_claim_events (to_department_id, bucket_date);
create index if not exists production_material_claim_events_actor_idx
  on public.production_material_claim_events (actor_id, created_at desc);

create index if not exists production_department_delegations_department_fk_idx
  on public.production_department_delegations (department_id);
create index if not exists production_department_delegations_created_by_idx
  on public.production_department_delegations (created_by);
create index if not exists production_department_delegations_updated_by_idx
  on public.production_department_delegations (updated_by);

-- Split write policies by operation so SELECT is handled only by *_read policy.
drop policy if exists production_material_claims_daily_write on public.production_material_claims_daily;
drop policy if exists production_material_claims_daily_insert on public.production_material_claims_daily;
drop policy if exists production_material_claims_daily_update on public.production_material_claims_daily;
drop policy if exists production_material_claims_daily_delete on public.production_material_claims_daily;

create policy production_material_claims_daily_insert
  on public.production_material_claims_daily
  for insert
  to authenticated
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

create policy production_material_claims_daily_update
  on public.production_material_claims_daily
  for update
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

create policy production_material_claims_daily_delete
  on public.production_material_claims_daily
  for delete
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

drop policy if exists production_material_claims_weekly_write on public.production_material_claims_weekly;
drop policy if exists production_material_claims_weekly_insert on public.production_material_claims_weekly;
drop policy if exists production_material_claims_weekly_update on public.production_material_claims_weekly;
drop policy if exists production_material_claims_weekly_delete on public.production_material_claims_weekly;

create policy production_material_claims_weekly_insert
  on public.production_material_claims_weekly
  for insert
  to authenticated
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

create policy production_material_claims_weekly_update
  on public.production_material_claims_weekly
  for update
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.claim_material')
    or public.can_act_on_claim_department(department_id, 'plan.release_claim')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

create policy production_material_claims_weekly_delete
  on public.production_material_claims_weekly
  for delete
  to authenticated
  using (
    public.is_admin()
    or public.has_permission('production-line-planning-manage')
    or public.can_act_on_claim_department(department_id, 'plan.reassign_claim')
  );

commit;
