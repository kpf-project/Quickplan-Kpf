create index if not exists production_daily_work_logs_edited_by_idx
  on public.production_daily_work_logs (edited_by, logged_at desc);

create index if not exists production_daily_work_logs_operator_user_id_idx
  on public.production_daily_work_logs (operator_user_id, logged_at desc);

