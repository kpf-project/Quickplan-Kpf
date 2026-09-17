begin read only;
select d.issue_date,i.lot_no,count(*) quantity,sum(i.weight_kg) weight_kg
from public.production_stock_issue_documents d join public.production_stock_issue_items i on i.issue_document_id=d.id
where d.status='confirmed' and i.status='confirmed' and i.product_code='WKB-0053' and i.lot_no='2908260053-1' and d.issue_date in ('2026-09-03','2026-09-04')
group by 1,2 order by 1;
select count(*) corrected_documents from public.production_stock_issue_documents where issue_no in ('ISS-20260904-111010448-F16F15','ISS-20260904-111010723-E0ADD5','ISS-20260904-111010958-D05AE9','ISS-20260904-111011195-49DED4') and issue_date='2026-09-04' and status='confirmed';
select count(*) corrected_movements from public.production_stock_movements where source_document_no in ('ISS-20260904-111010448-F16F15','ISS-20260904-111010723-E0ADD5','ISS-20260904-111010958-D05AE9','ISS-20260904-111011195-49DED4') and movement_date='2026-09-04' and movement_type='issue_out';
select count(*) active_guard from pg_trigger where tgrelid='public.production_stock_issue_items'::regclass and tgname='guard_stock_issue_cancellation_children' and tgenabled='O';
select count(*) migration_record from supabase_migrations.schema_migrations where version='20260907030917';
commit;
