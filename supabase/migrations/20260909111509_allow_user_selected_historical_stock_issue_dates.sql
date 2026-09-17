-- The selected issue date is the accounting date. Keep the atomic LOT balance
-- checks, but allow operators to post an issue to that explicitly selected day.

drop trigger if exists production_stock_issue_documents_guard_date
  on public.production_stock_issue_documents;

drop function if exists public.guard_production_stock_issue_date();

notify pgrst, 'reload schema';
