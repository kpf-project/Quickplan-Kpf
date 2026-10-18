-- Move the 14 user-confirmed WKB-0050 labels from Oct 15 to Oct 14.
-- The physical scan timestamps, barcodes, weights, room, and statuses stay unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local app.allow_historical_stock_date = 'on';

create temp table target_items (
  issue_no text primary key,
  barcode text not null unique,
  weight_kg numeric not null
);

insert into target_items values
  ('ISS-20261015-081316516-CEA126', '06102600500083', 11.680),
  ('ISS-20261015-081342465-72ABF2', '06102600500125', 11.730),
  ('ISS-20261015-081446720-4BCA83', '06102600500126', 11.200),
  ('ISS-20261015-081455108-D38F72', '06102600500127', 12.290),
  ('ISS-20261015-081509743-19C29B', '06102600500128', 11.530),
  ('ISS-20261015-081520801-17F89E', '06102600500095', 11.650),
  ('ISS-20261015-081530858-69CF57', '06102600500094', 11.880),
  ('ISS-20261015-081539653-C6FB94', '06102600500129', 12.100),
  ('ISS-20261015-082126653-D4E4B0', '06102600500130', 12.160),
  ('ISS-20261015-082138823-56E8BE', '06102600500131', 11.830),
  ('ISS-20261015-082150994-965115', '06102600500135', 9.840),
  ('ISS-20261015-082201411-523BF4', '06102600500136', 11.570),
  ('ISS-20261015-082214103-264D97', '06102600500121', 10.880),
  ('ISS-20261015-082224214-5CD587', '06102600500122', 10.340);

select d.id
from public.production_stock_issue_documents d
join target_items t using (issue_no)
for update of d;

select i.id
from public.production_stock_issue_items i
join public.production_stock_issue_documents d on d.id = i.issue_document_id
join target_items t using (issue_no)
for update of i;

select m.id
from public.production_stock_movements m
join target_items t on t.issue_no = m.source_document_no
for update of m;

create temp table before_documents as
select d.*
from public.production_stock_issue_documents d
join target_items t using (issue_no);

create temp table before_items as
select i.*
from public.production_stock_issue_items i
join before_documents d on d.id = i.issue_document_id;

create temp table before_movements as
select m.*
from public.production_stock_movements m
join target_items t on t.issue_no = m.source_document_no;

do $$
begin
  if (select count(*) from before_documents) <> 14
     or (select count(*) from before_items) <> 14
     or (select count(*) from before_movements) <> 14 then
    raise exception 'Expected exactly 14 documents, items, and movements';
  end if;

  if (select round(sum(weight_kg)::numeric, 3) from before_items) <> 160.680 then
    raise exception 'Expected exactly 160.680 kg';
  end if;

  if exists (
    select 1
    from before_documents d
    where d.issue_date <> date '2026-10-15'
       or d.status <> 'confirmed'
       or d.remark <> 'Shift 1 (2026-10-15)'
  ) then
    raise exception 'Document precondition failed';
  end if;

  if exists (
    select 1
    from before_items i
    join before_documents d on d.id = i.issue_document_id
    join target_items t using (issue_no)
    where i.barcode <> t.barcode
       or i.weight_kg <> t.weight_kg
       or i.quantity <> 1
       or i.product_code <> 'WKB-0050'
       or i.lot_no <> '0610260050-1'
       or i.status <> 'confirmed'
  ) then
    raise exception 'Item precondition failed';
  end if;

  if exists (
    select 1
    from before_movements m
    join target_items t on t.issue_no = m.source_document_no
    where m.movement_date <> date '2026-10-15'
       or m.source_document_type <> 'stock_issue'
       or m.movement_type <> 'issue_out'
       or m.product_code <> 'WKB-0050'
       or m.lot_no <> '0610260050-1'
       or m.quantity_out <> 1
       or m.weight_out_kg <> t.weight_kg
       or m.metadata->>'barcode' is distinct from t.barcode
  ) then
    raise exception 'Movement precondition failed';
  end if;
end $$;

\copy (select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d) order by d.issue_no) from before_documents d),'items',(select jsonb_agg(to_jsonb(i) order by i.barcode) from before_items i),'movements',(select jsonb_agg(to_jsonb(m) order by m.source_document_no) from before_movements m))) to '.backups/wkb0050-061026-date-20261015-to-14-before.json'

update public.production_stock_issue_documents d
set issue_date = date '2026-10-14',
    remark = replace(d.remark, '2026-10-15', '2026-10-14'),
    metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'dateCorrection20261015',
      jsonb_build_object(
        'previousDate', '2026-10-15',
        'correctedDate', '2026-10-14',
        'reason', 'User confirmed the selected issue date was one day late',
        'correctedAt', now()
      )
    )
from before_documents b
where d.id = b.id;

update public.production_stock_movements m
set movement_date = date '2026-10-14'
from before_movements b
where m.id = b.id;

do $$
begin
  if (select count(*) from public.production_stock_issue_documents d join before_documents b on b.id = d.id where d.issue_date = date '2026-10-14') <> 14 then
    raise exception 'Document verification failed';
  end if;
  if (select count(*) from public.production_stock_movements m join before_movements b on b.id = m.id where m.movement_date = date '2026-10-14') <> 14 then
    raise exception 'Movement verification failed';
  end if;
  if exists (select 1 from public.production_stock_issue_items i join before_items b on b.id = i.id where to_jsonb(i) <> to_jsonb(b)) then
    raise exception 'Item changed unexpectedly';
  end if;
  if exists (select 1 from public.production_stock_movements m join before_movements b on b.id = m.id where (to_jsonb(m) - 'movement_date' - 'updated_at') <> (to_jsonb(b) - 'movement_date' - 'updated_at')) then
    raise exception 'Movement non-date fields changed';
  end if;
  if exists (select 1 from public.production_stock_issue_documents d join before_documents b on b.id = d.id where (to_jsonb(d) - 'issue_date' - 'remark' - 'metadata' - 'updated_at') <> (to_jsonb(b) - 'issue_date' - 'remark' - 'metadata' - 'updated_at')) then
    raise exception 'Document unexpected fields changed';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select issue_date, count(*) labels, sum(quantity) quantity, round(sum(weight_kg)::numeric, 3) weight_kg
from public.production_stock_issue_report_lines_v
where product_code = 'WKB-0050'
  and lot_no = '0610260050-1'
  and issue_date between date '2026-10-14' and date '2026-10-15'
  and document_status = 'confirmed'
  and item_status = 'confirmed'
group by issue_date
order by issue_date;
