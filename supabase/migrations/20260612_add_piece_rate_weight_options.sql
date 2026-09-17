create table if not exists public.production_piece_rate_profile_weights (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.production_piece_rate_profiles(id) on delete cascade,
  label text not null,
  weight_kg numeric(12,4) not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  constraint production_piece_rate_profile_weights_label_check check (length(trim(label)) > 0),
  constraint production_piece_rate_profile_weights_weight_kg_check check (weight_kg > 0)
);

create index if not exists production_piece_rate_profile_weights_profile_id_idx
  on public.production_piece_rate_profile_weights (profile_id, sort_order, label);

alter table public.production_piece_rate_profile_weights enable row level security;

drop policy if exists production_piece_rate_profile_weights_read on public.production_piece_rate_profile_weights;
create policy production_piece_rate_profile_weights_read
  on public.production_piece_rate_profile_weights
  for select
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-view')
    or public.has_permission('production-line-settings-manage')
  );

drop policy if exists production_piece_rate_profile_weights_manage on public.production_piece_rate_profile_weights;
create policy production_piece_rate_profile_weights_manage
  on public.production_piece_rate_profile_weights
  for all
  using (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  )
  with check (
    public.is_admin()
    or public.has_permission('production-line-settings-manage')
  );

alter table public.production_piece_rate_product_mappings
  add column if not exists weight_option_id uuid null references public.production_piece_rate_profile_weights(id) on delete set null;

create index if not exists production_piece_rate_product_mappings_weight_option_id_idx
  on public.production_piece_rate_product_mappings (weight_option_id);

alter table public.production_piece_rate_logs
  add column if not exists weight_option_id_snapshot uuid null,
  add column if not exists weight_option_label_snapshot text null,
  add column if not exists weight_kg_snapshot numeric(12,4) null;

insert into public.production_piece_rate_profile_weights (
  profile_id,
  label,
  weight_kg,
  sort_order,
  is_active,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  p.id,
  trim(to_char(p.kg_per_pail, 'FM999999990.####')) || ' กก.',
  p.kg_per_pail,
  0,
  p.is_active,
  now(),
  now(),
  p.created_by,
  p.updated_by
from public.production_piece_rate_profiles p
where p.input_mode = 'pail'
  and p.kg_per_pail is not null
  and p.kg_per_pail > 0
  and not exists (
    select 1
    from public.production_piece_rate_profile_weights w
    where w.profile_id = p.id
  );

update public.production_piece_rate_product_mappings m
set weight_option_id = w.id
from public.production_piece_rate_profiles p
join public.production_piece_rate_profile_weights w
  on w.profile_id = p.id
where m.profile_id = p.id
  and p.input_mode = 'pail'
  and m.weight_option_id is null;

update public.production_piece_rate_logs l
set
  weight_option_label_snapshot = coalesce(
    l.weight_option_label_snapshot,
    trim(to_char(l.kg_per_pail_snapshot, 'FM999999990.####')) || ' กก.'
  ),
  weight_kg_snapshot = coalesce(l.weight_kg_snapshot, l.kg_per_pail_snapshot)
where l.input_mode_snapshot = 'pail'
  and l.kg_per_pail_snapshot is not null
  and (
    l.weight_option_label_snapshot is null
    or trim(l.weight_option_label_snapshot) = ''
    or l.weight_kg_snapshot is null
  );
