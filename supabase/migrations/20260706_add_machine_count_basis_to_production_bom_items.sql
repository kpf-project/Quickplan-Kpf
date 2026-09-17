alter table if exists public.production_bom_items
  add column if not exists machine_base numeric not null default 1;

alter table if exists public.production_bom_items
  add column if not exists machine_round_mode text not null default 'NONE';

alter table if exists public.production_bom_items
  drop constraint if exists production_bom_items_calculation_basis_check;

alter table if exists public.production_bom_items
  add constraint production_bom_items_calculation_basis_check
  check (calculation_basis in ('JOB_QTY', 'HEADCOUNT', 'MACHINE_COUNT'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_machine_base_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_machine_base_check
      check (machine_base > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_machine_round_mode_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_machine_round_mode_check
      check (machine_round_mode in ('NONE', 'UP', 'DOWN', 'NEAREST'));
  end if;
end $$;
