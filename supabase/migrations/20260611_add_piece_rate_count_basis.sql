alter table public.production_piece_rate_profiles
  add column if not exists wage_basis text not null default 'kg',
  add column if not exists pay_rate_per_unit numeric(12,4) not null default 0;

alter table public.production_piece_rate_profiles
  drop constraint if exists production_piece_rate_profiles_wage_basis_check;

alter table public.production_piece_rate_profiles
  add constraint production_piece_rate_profiles_wage_basis_check
  check (wage_basis in ('kg', 'count'));

alter table public.production_piece_rate_logs
  add column if not exists count_value_snapshot numeric(12,4) not null default 1,
  add column if not exists wage_basis_snapshot text not null default 'kg',
  add column if not exists pay_rate_per_unit_snapshot numeric(12,4) not null default 0;

alter table public.production_piece_rate_logs
  drop constraint if exists production_piece_rate_logs_wage_basis_snapshot_check;

alter table public.production_piece_rate_logs
  add constraint production_piece_rate_logs_wage_basis_snapshot_check
  check (wage_basis_snapshot in ('kg', 'count'));

update public.production_piece_rate_profiles
set
  wage_basis = coalesce(nullif(trim(wage_basis), ''), 'kg'),
  pay_rate_per_unit = coalesce(pay_rate_per_unit, 0)
where wage_basis is distinct from coalesce(nullif(trim(wage_basis), ''), 'kg')
   or pay_rate_per_unit is null;

update public.production_piece_rate_logs
set
  count_value_snapshot = coalesce(count_value_snapshot, 1),
  wage_basis_snapshot = coalesce(nullif(trim(wage_basis_snapshot), ''), 'kg'),
  pay_rate_per_unit_snapshot = coalesce(pay_rate_per_unit_snapshot, 0)
where count_value_snapshot is null
   or wage_basis_snapshot is null
   or trim(wage_basis_snapshot) = ''
   or pay_rate_per_unit_snapshot is null;
