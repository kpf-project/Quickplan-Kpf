alter table public.attendance_scan_events
  add column if not exists employee_code_key text,
  add column if not exists scan_business_date date;

create unique index if not exists attendance_scan_events_daily_type_unique_idx
  on public.attendance_scan_events (
    employee_code_key,
    event_type,
    scan_business_date
  )
  where status = 'accepted'
    and employee_code_key is not null
    and scan_business_date is not null;
