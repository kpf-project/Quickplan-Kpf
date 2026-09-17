-- Production plan status table for planning/report tabs
-- Keeps ready/confirmed records and BOM snapshot for audit

create table if not exists public.production_plan_status (
  plan_id        text primary key,
  sku_code       text not null,
  sku_name       text not null,
  category_name  text,
  status         text default 'ready',
  planned_qty    numeric,
  unit           text,
  period_start   date,
  period_end     date,
  bom_snapshot   jsonb default '[]'::jsonb,
  confirmed_at   timestamptz default now(),
  inserted_at    timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_plan_status_period_start on public.production_plan_status (period_start);
create index if not exists idx_plan_status_period_end   on public.production_plan_status (period_end);
create index if not exists idx_plan_status_status       on public.production_plan_status (status);

-- Touch updated_at automatically
create or replace function public.touch_production_plan_status()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_production_plan_status on public.production_plan_status;
create trigger trg_touch_production_plan_status
before update on public.production_plan_status
for each row execute procedure public.touch_production_plan_status();
