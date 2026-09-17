alter table if exists public.production_bom_items
  add column if not exists calculation_basis text not null default 'JOB_QTY';

alter table if exists public.production_bom_items
  add column if not exists headcount_base numeric not null default 1;

alter table if exists public.production_bom_items
  add column if not exists headcount_round_mode text not null default 'NONE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_calculation_basis_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_calculation_basis_check
      check (calculation_basis in ('JOB_QTY', 'HEADCOUNT'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_headcount_base_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_headcount_base_check
      check (headcount_base > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_bom_items_headcount_round_mode_check'
  ) then
    alter table public.production_bom_items
      add constraint production_bom_items_headcount_round_mode_check
      check (headcount_round_mode in ('NONE', 'UP', 'DOWN', 'NEAREST'));
  end if;
end $$;
