alter table if exists public.production_master_plans
  drop constraint if exists production_master_plans_status_check;

alter table if exists public.production_master_plans
  add constraint production_master_plans_status_check
  check (status in (
    'draft',
    'pending_verify',
    'published',
    'rejected',
    'closed',
    'cancelled'
  ));
