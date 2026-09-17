alter table public.profiles
  add column if not exists is_archived boolean not null default false;

alter table public.profiles
  add column if not exists archived_at timestamptz;

alter table public.profiles
  add column if not exists archived_by uuid;

alter table public.profiles
  add column if not exists archive_reason text;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  add column if not exists deleted_by uuid;

alter table public.profiles
  add column if not exists delete_reason text;

create index if not exists idx_profiles_is_archived on public.profiles (is_archived);
create index if not exists idx_profiles_deleted_at on public.profiles (deleted_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_archive_requires_inactive_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_archive_requires_inactive_chk
      CHECK (NOT is_archived OR is_active = false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_deleted_requires_archived_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_deleted_requires_archived_chk
      CHECK (deleted_at IS NULL OR is_archived = true);
  END IF;
END $$;
