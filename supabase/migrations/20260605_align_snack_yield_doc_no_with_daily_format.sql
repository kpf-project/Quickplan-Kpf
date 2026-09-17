alter table public.production_snack_yield_logs
  drop constraint if exists production_snack_yield_logs_doc_no_check;

alter table public.production_snack_yield_logs
  add constraint production_snack_yield_logs_doc_no_check
  check (
    doc_no ~ '^[0-9]{2}(0[1-9]|1[0-2])[0-9]{2,}$'
    or doc_no ~ '^[A-Z0-9]{2,8}[0-9]{2}R[1-9][0-9]*[0-9]{6}$'
  );
