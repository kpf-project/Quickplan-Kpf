alter table public.production_stock_issue_items
  drop constraint if exists production_stock_issue_items_source_receipt_id_fkey;

alter table public.production_stock_issue_items
  add constraint production_stock_issue_items_source_receipt_id_fkey
    foreign key (source_receipt_id)
    references public.production_weight_receipts(id)
    on delete cascade;

notify pgrst, 'reload schema';
