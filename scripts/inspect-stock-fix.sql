begin read only;
select d.id,d.issue_no,d.issue_date,d.remark,i.id item_id,i.barcode,i.lot_no,i.weight_kg,i.quantity,i.status,i.issued_at,
 m.id movement_id,m.movement_date,m.movement_type,m.quantity_out,m.weight_out_kg,m.metadata
from public.production_stock_issue_documents d
join public.production_stock_issue_items i on i.issue_document_id=d.id
left join public.production_stock_movements m on m.source_document_no=d.issue_no
where d.issue_no in ('ISS-20260904-111010448-F16F15','ISS-20260904-111010723-E0ADD5','ISS-20260904-111010958-D05AE9','ISS-20260904-111011195-49DED4');
select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='cancel_production_stock_issue_item';
select p.proname, substring(p.prosrc from 'for update[^;]*'), substring(p.prosrc from 'items.status[^;]*') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_production_stock_return','create_production_stock_waste');
select tgname from pg_trigger where tgrelid='public.production_stock_issue_items'::regclass and not tgisinternal;
commit;
