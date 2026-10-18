alter table public.production_cost_sheets
  add column if not exists actual_weight_kg numeric(14, 4);

comment on column public.production_cost_sheets.actual_weight_kg is
  'Measured output weight kept separately when the cost unit is piece, pail, case, or another count unit.';
