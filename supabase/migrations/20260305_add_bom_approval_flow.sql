insert into public.permissions (perm_key, label, path, group_key, created_at)
values
  ('production-line-bom-approve', 'Production Line BOM (Approve)', '/production-line/bom/approval', 'production-line', now())
on conflict (perm_key) do nothing;

alter table public.production_boms
  drop constraint if exists production_boms_status_check;

alter table public.production_bom_versions
  drop constraint if exists production_bom_versions_status_check;

update public.production_boms
  set status = 'pending_review'
  where status = 'review';

update public.production_boms
  set status = 'approved'
  where status = 'locked';

update public.production_bom_versions
  set status = 'pending_review'
  where status = 'review';

update public.production_bom_versions
  set status = 'approved'
  where status = 'locked';

alter table public.production_boms
  add constraint production_boms_status_check
    check (status in ('draft', 'pending_review', 'approved', 'rejected'));

alter table public.production_bom_versions
  add constraint production_bom_versions_status_check
    check (status in ('draft', 'pending_review', 'approved', 'rejected'));

create table if not exists public.production_bom_approvals (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.production_boms(id) on delete cascade,
  version_id uuid not null references public.production_bom_versions(id) on delete cascade,
  status text not null
    check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  reason text,
  token_id text not null unique
);

create index if not exists production_bom_approvals_bom_idx
  on public.production_bom_approvals (bom_id);

create index if not exists production_bom_approvals_version_idx
  on public.production_bom_approvals (version_id);

create index if not exists production_bom_approvals_status_idx
  on public.production_bom_approvals (status);

alter table public.production_bom_approvals enable row level security;

drop policy if exists production_bom_approvals_read on public.production_bom_approvals;
create policy production_bom_approvals_read
  on public.production_bom_approvals
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-approve')
    or public.has_permission('production-line-bom-manage')
  );

drop policy if exists production_bom_approvals_manage on public.production_bom_approvals;
create policy production_bom_approvals_manage
  on public.production_bom_approvals
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-bom-approve')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-bom-approve')
  );
