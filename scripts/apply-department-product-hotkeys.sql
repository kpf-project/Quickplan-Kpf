\set ON_ERROR_STOP on
begin;
create table if not exists public.production_department_product_hotkeys (
  department_id uuid not null references public.production_departments(id) on delete restrict,
  product_code text not null check (length(product_code) between 1 and 100 and product_code = upper(trim(product_code))),
  hotkey text not null check (hotkey ~ '^[1-9A-Z]$'),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (department_id, product_code),
  unique (department_id, hotkey)
);
alter table public.production_department_product_hotkeys enable row level security;
revoke all on public.production_department_product_hotkeys from public, anon, authenticated;
grant select, insert, update, delete on public.production_department_product_hotkeys to service_role;
select 'department_product_hotkeys_ready';
\if :APPLY
commit;
\else
rollback;
\endif
