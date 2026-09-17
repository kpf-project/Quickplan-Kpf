begin read only;
do $$ begin
if exists(select 1 from public.production_stock_issue_items where id in ('ea299c8d-8d13-454a-afa2-ef9e236da55a','a183e89c-d1eb-4a1c-a94e-b081e52c20f4') and status<>'confirmed') then raise exception 'Source issues are not restored'; end if;
if exists(select 1 from public.production_stock_issue_items where id in ('c4228259-5b64-4eaa-a81b-3c9e90da9b3c','794f2116-07aa-48df-a63b-948e3d82da06') and status<>'voided') then raise exception 'Duplicate original-barcode issues are not voided'; end if;
if (select count(*) from public.production_stock_issue_items where id in ('0ff4ff86-1a0f-4871-8916-34a7385435ec','5d7cef03-4aa2-41f7-996c-5bb3cb1194ed') and status='confirmed')<>2 then raise exception 'Return-barcode issues changed unexpectedly'; end if;
end $$;
commit;
