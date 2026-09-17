begin read only;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'production_weight_receipts_barcode_uidx'
  ) then
    raise exception 'Receipt barcode unique index is missing';
  end if;

  if exists (
    select 1 from public.production_weight_receipts
    where barcode is not null
    group by barcode having count(*) > 1
  ) then
    raise exception 'Duplicate receipt barcodes remain';
  end if;

  if not exists (
    select 1 from public.production_weight_receipts
    where id = 'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'::uuid
      and barcode = '02072600020350X02'
  ) then
    raise exception 'Known duplicate receipt was not repaired';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cancel_production_weight_receipt'
      and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) = 'p_receipt_id uuid, p_actor_user_id uuid, p_void_reason text'
  ) then
    raise exception 'Atomic receipt cancellation RPC is missing';
  end if;

  if has_function_privilege('anon', 'public.cancel_production_stock_issue_item(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.cancel_production_stock_issue_item(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_production_stock_return(text,numeric,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.create_production_stock_return(text,numeric,uuid,text)', 'EXECUTE')
  then
    raise exception 'A stock mutation RPC is still client-executable';
  end if;
end;
$$;

select 'PASS' as result,
  (select count(*) from public.production_weight_receipts where barcode = '02072600020350X02') as repaired_receipts,
  (select count(*) from public.production_stock_issue_items
   where source_receipt_id = 'b4faa2be-05dd-4b93-a602-ce57a9e5cd34'::uuid
     and barcode = '02072600020350X02') as repaired_issue_items;

commit;
