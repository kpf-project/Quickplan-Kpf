-- Optimize production_stock_movements query performance for reports
create index if not exists production_stock_movements_report_idx
  on public.production_stock_movements (source_document_type, movement_date desc, movement_at desc);
