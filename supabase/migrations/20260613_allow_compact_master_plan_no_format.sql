-- Allow compact monthly master plan number format: MPYYYYMMXXX
-- Keep backward compatibility for legacy dashed rows.

alter table if exists public.production_master_plans
  drop constraint if exists production_master_plans_master_plan_no_format_check;
alter table if exists public.production_master_plans
  add constraint production_master_plans_master_plan_no_format_check
  check (
    master_plan_no ~ '^MP([0-9]{9}|-[0-9]{4}-(W[0-9]{2}|[0-9]{2})-[0-9]{3})$'
  )
  not valid;

alter table if exists public.production_sub_plans
  drop constraint if exists production_sub_plans_master_plan_no_format_check;
alter table if exists public.production_sub_plans
  add constraint production_sub_plans_master_plan_no_format_check
  check (
    master_plan_no ~ '^MP([0-9]{9}|-[0-9]{4}-(W[0-9]{2}|[0-9]{2})-[0-9]{3})$'
  )
  not valid;

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_master_plan_no_format_check;
alter table if exists public.production_plan_status
  add constraint production_plan_status_master_plan_no_format_check
  check (
    master_plan_no is null
    or master_plan_no ~ '^MP([0-9]{9}|-[0-9]{4}-(W[0-9]{2}|[0-9]{2})-[0-9]{3})$'
  )
  not valid;
