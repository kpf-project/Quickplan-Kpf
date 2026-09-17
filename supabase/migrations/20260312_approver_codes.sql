alter table public.profiles
  add column if not exists approver_code text,
  add column if not exists approver_code_active boolean default true not null;

create unique index if not exists profiles_approver_code_unique
  on public.profiles (approver_code)
  where approver_code is not null;

create table if not exists public.production_bom_approval_logs (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.production_bom_approvals(id) on delete cascade,
  action text not null check (action in ('approved', 'rejected')),
  approver_profile_id uuid not null references public.profiles(id),
  approver_code text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists production_bom_approval_logs_approval_idx
  on public.production_bom_approval_logs (approval_id);

create index if not exists production_bom_approval_logs_profile_idx
  on public.production_bom_approval_logs (approver_profile_id);
