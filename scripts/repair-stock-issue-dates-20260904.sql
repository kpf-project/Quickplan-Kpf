-- Exactly four user-approved documents. Run with psql ON_ERROR_STOP.
-- Backup is exported BEFORE updates. All database changes are atomic.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temp table target_issue_dates(issue_no text primary key,barcode text,weight_kg numeric);
insert into target_issue_dates values
('ISS-20260904-111010448-F16F15','29082600530100',21.93),
('ISS-20260904-111010723-E0ADD5','29082600530101',21.55),
('ISS-20260904-111010958-D05AE9','29082600530102',19.47),
('ISS-20260904-111011195-49DED4','29082600530103',18.90);
select d.id from public.production_stock_issue_documents d join target_issue_dates t using(issue_no) for update of d;
select i.id from public.production_stock_issue_items i join public.production_stock_issue_documents d on d.id=i.issue_document_id join target_issue_dates t using(issue_no) for update of i;
select m.id from public.production_stock_movements m join target_issue_dates t on t.issue_no=m.source_document_no for update of m;
create temp table before_documents as select d.* from public.production_stock_issue_documents d join target_issue_dates t using(issue_no);
create temp table before_items as select i.* from public.production_stock_issue_items i join before_documents d on d.id=i.issue_document_id;
create temp table before_movements as select m.* from public.production_stock_movements m join target_issue_dates t on t.issue_no=m.source_document_no;
do $$ begin
if (select count(*) from before_documents) <> 4 or (select count(*) from before_items) <> 4 or (select count(*) from before_movements) <> 4 then raise exception 'Expected exactly four documents/items/movements'; end if;
if exists(select 1 from before_documents where issue_date <> '2026-09-03' or status <> 'confirmed' or remark not like '%Shift 1 (2026-09-03)%') then raise exception 'Document precondition failed'; end if;
if exists(select 1 from before_items i join before_documents d on d.id=i.issue_document_id join target_issue_dates t using(issue_no) where i.barcode<>t.barcode or i.weight_kg<>t.weight_kg or i.quantity<>1 or i.product_code<>'WKB-0053' or i.lot_no<>'2908260053-1' or i.status<>'confirmed' or (i.issued_at at time zone 'Asia/Bangkok')::date<>'2026-09-04') then raise exception 'Item precondition failed'; end if;
if exists(select 1 from before_movements m join target_issue_dates t on t.issue_no=m.source_document_no where m.movement_date<>'2026-09-03' or m.movement_type<>'issue_out' or m.product_code<>'WKB-0053' or m.lot_no<>'2908260053-1' or m.quantity_out<>1 or m.weight_out_kg<>t.weight_kg or m.metadata->>'barcode' is distinct from t.barcode) then raise exception 'Movement precondition failed'; end if;
end $$;
\copy (select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d)) from before_documents d),'items',(select jsonb_agg(to_jsonb(i)) from before_items i),'movements',(select jsonb_agg(to_jsonb(m)) from before_movements m))) to '.backups/stock-issue-dates-20260904-before.json'
update public.production_stock_issue_documents d set issue_date='2026-09-04',remark=replace(d.remark,'Shift 1 (2026-09-03)','Shift 1 (2026-09-04)'),metadata=d.metadata || jsonb_build_object('dateCorrection20260907',jsonb_build_object('previousDate','2026-09-03','correctedDate','2026-09-04','reason','User confirmed four documents belong to 2026-09-04','correctedAt',now())) from before_documents b where d.id=b.id;
update public.production_stock_movements m set movement_date='2026-09-04' from before_movements b where m.id=b.id;
do $$ begin
if (select count(*) from public.production_stock_issue_documents d join before_documents b on b.id=d.id where d.issue_date='2026-09-04')<>4 then raise exception 'Document verification failed'; end if;
if (select count(*) from public.production_stock_movements m join before_movements b on b.id=m.id where m.movement_date='2026-09-04')<>4 then raise exception 'Movement verification failed'; end if;
if exists(select 1 from public.production_stock_issue_items i join before_items b on b.id=i.id where to_jsonb(i)<>to_jsonb(b)) then raise exception 'Item changed unexpectedly'; end if;
if exists(select 1 from public.production_stock_movements m join before_movements b on b.id=m.id where (to_jsonb(m)-'movement_date'-'updated_at')<>(to_jsonb(b)-'movement_date'-'updated_at')) then raise exception 'Movement non-date fields changed'; end if;
if exists(select 1 from public.production_stock_issue_documents d join before_documents b on b.id=d.id where (to_jsonb(d)-'issue_date'-'remark'-'metadata'-'updated_at')<>(to_jsonb(b)-'issue_date'-'remark'-'metadata'-'updated_at')) then raise exception 'Document unexpected changes'; end if;
end $$;
commit;
select issue_date,lot_no,sum(quantity),sum(weight_kg) from public.production_stock_issue_report_lines_v where product_code='WKB-0053' and lot_no='2908260053-1' and issue_date between '2026-09-03' and '2026-09-04' and document_status='confirmed' and item_status='confirmed' group by 1,2 order by 1;
