alter table if exists public.production_bom_items
  add column if not exists dough_set_base numeric not null default 1;

alter table if exists public.production_bom_items
  add column if not exists dough_set_round_mode text not null default 'NONE';

alter table if exists public.production_bom_items
  drop constraint if exists production_bom_items_calculation_basis_check;

alter table if exists public.production_bom_items
  add constraint production_bom_items_calculation_basis_check
  check (calculation_basis in ('JOB_QTY', 'HEADCOUNT', 'MACHINE_COUNT', 'DOUGH_SET_COUNT'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_dough_set_base_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_dough_set_base_check
      check (dough_set_base > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_dough_set_round_mode_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_dough_set_round_mode_check
      check (dough_set_round_mode in ('NONE', 'UP', 'DOWN', 'NEAREST'));
  end if;
end $$;

alter table if exists public.production_plan_status
  add column if not exists line_dough_set_count integer;

alter table if exists public.production_plan_status
  drop constraint if exists production_plan_status_line_dough_set_count_check;

alter table if exists public.production_plan_status
  add constraint production_plan_status_line_dough_set_count_check
  check (line_dough_set_count is null or line_dough_set_count >= 0);
