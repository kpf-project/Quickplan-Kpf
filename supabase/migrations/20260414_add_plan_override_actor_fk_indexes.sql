-- Add covering indexes for FK columns used by Supabase advisor
create index if not exists production_plan_events_actor_id_idx
  on public.production_plan_events (actor_id)
  where actor_id is not null;

create index if not exists production_plan_material_overrides_edited_by_user_id_idx
  on public.production_plan_material_overrides (edited_by_user_id)
  where edited_by_user_id is not null;
