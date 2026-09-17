create table if not exists public.employee_photos (
  employee_code text primary key,
  image_data text not null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_photos_code_not_blank check (length(btrim(employee_code)) > 0),
  constraint employee_photos_image_data_format check (image_data ~ '^data:image/(webp|jpeg|png);base64,')
);

alter table public.employee_photos enable row level security;
revoke all on table public.employee_photos from anon, authenticated;

comment on table public.employee_photos is
  'Application-managed employee photos keyed by the HR gateway employee code. Accessed only through permission-checked server routes.';
