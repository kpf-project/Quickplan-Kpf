-- Reclassify the confirmed Sep 28 issues for the two exact product/LOT pairs.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('sep28-wkb0045-wkb0048-destination-room', 0));

do $$
declare
  v_item_count integer;
  v_document_count integer;
  v_movement_count integer;
  v_wkb0045_qty numeric;
  v_wkb0045_kg numeric;
  v_wkb0048_qty numeric;
  v_wkb0048_kg numeric;
begin
  with targets as (
    select v.*
    from public.production_stock_issue_report_lines_v v
    where v.issue_date = date '2026-09-28'
      and v.issue_type = 'KPF'
      and v.document_status = 'confirmed'
      and v.item_status = 'confirmed'
      and v.destination_room_code = 'BISCUIT_PACKING'
      and (
        (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
        or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
      )
  )
  select count(*), count(distinct issue_document_id),
         sum(quantity) filter (where product_code = 'WKB-0045'),
         sum(weight_kg) filter (where product_code = 'WKB-0045'),
         sum(quantity) filter (where product_code = 'WKB-0048'),
         sum(weight_kg) filter (where product_code = 'WKB-0048')
  into v_item_count, v_document_count,
       v_wkb0045_qty, v_wkb0045_kg, v_wkb0048_qty, v_wkb0048_kg
  from targets;

  if v_item_count <> 49 or v_document_count <> 49
     or v_wkb0045_qty <> 10.000 or v_wkb0045_kg <> 127.070
     or v_wkb0048_qty <> 39.000 or v_wkb0048_kg <> 447.220 then
    raise exception 'Target precondition failed: items %, docs %, WKB-0045 %/%, WKB-0048 %/%',
      v_item_count, v_document_count,
      v_wkb0045_qty, v_wkb0045_kg, v_wkb0048_qty, v_wkb0048_kg;
  end if;

  select count(*) into v_movement_count
  from public.production_stock_movements m
  where m.source_document_type = 'stock_issue'
    and m.movement_type = 'issue_out'
    and m.source_document_no in (
      select v.issue_no
      from public.production_stock_issue_report_lines_v v
      where v.issue_date = date '2026-09-28'
        and v.issue_type = 'KPF'
        and v.document_status = 'confirmed'
        and v.item_status = 'confirmed'
        and v.destination_room_code = 'BISCUIT_PACKING'
        and (
          (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
          or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
        )
    );

  if v_movement_count <> 49 then
    raise exception 'Movement precondition failed: expected 49, found %', v_movement_count;
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d) order by d.issue_no) from public.production_stock_issue_documents d where d.id in (select v.issue_document_id from public.production_stock_issue_report_lines_v v where v.issue_date = date '2026-09-28' and v.issue_type = 'KPF' and v.document_status = 'confirmed' and v.item_status = 'confirmed' and v.destination_room_code = 'BISCUIT_PACKING' and ((v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1') or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')))),'items',(select jsonb_agg(to_jsonb(i) order by i.barcode) from public.production_stock_issue_items i where i.id in (select v.issue_item_id from public.production_stock_issue_report_lines_v v where v.issue_date = date '2026-09-28' and v.issue_type = 'KPF' and v.document_status = 'confirmed' and v.item_status = 'confirmed' and v.destination_room_code = 'BISCUIT_PACKING' and ((v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1') or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')))),'movements',(select jsonb_agg(to_jsonb(m) order by m.source_document_no) from public.production_stock_movements m where m.source_document_type = 'stock_issue' and m.movement_type = 'issue_out' and m.source_document_no in (select v.issue_no from public.production_stock_issue_report_lines_v v where v.issue_date = date '2026-09-28' and v.issue_type = 'KPF' and v.document_status = 'confirmed' and v.item_status = 'confirmed' and v.destination_room_code = 'BISCUIT_PACKING' and ((v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1') or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')))))) to '.backups/sep28-wkb0045-wkb0048-to-packing400-before.json'
\endif

insert into public.audit_logs (actor_id, action, target_table, metadata)
select
  (array_agg(d.created_by order by targets.issue_no))[1],
  'reclassify_stock_issue_destination_room',
  'production_stock_issue_documents',
  jsonb_build_object(
    'reason', 'ผู้ใช้ยืนยันว่ารายการวันที่ 28 ของสอง LOT นี้เบิกไปห้องบรรจุ 400',
    'fromRoomCode', 'BISCUIT_PACKING',
    'fromRoomName', 'ห้องบรรจุบิสกิต',
    'toRoomCode', 'PACKING_400',
    'toRoomName', 'ห้องบรรจุ 400',
    'issueDate', '2026-09-28',
    'targets', jsonb_build_array(
      jsonb_build_object('productCode', 'WKB-0045', 'lotNo', '1509260045-1', 'quantity', 10.000, 'weightKg', 127.070),
      jsonb_build_object('productCode', 'WKB-0048', 'lotNo', '2409260048-1', 'quantity', 39.000, 'weightKg', 447.220)
    ),
    'issueDocumentIds', jsonb_agg(targets.issue_document_id order by targets.issue_no),
    'issueItemIds', jsonb_agg(targets.issue_item_id order by targets.issue_no)
  )
from (
  select v.issue_document_id, v.issue_item_id, v.issue_no
  from public.production_stock_issue_report_lines_v v
  where v.issue_date = date '2026-09-28'
    and v.issue_type = 'KPF'
    and v.document_status = 'confirmed'
    and v.item_status = 'confirmed'
    and v.destination_room_code = 'BISCUIT_PACKING'
    and (
      (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
      or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
  )
) targets
join public.production_stock_issue_documents d on d.id = targets.issue_document_id;

with targets as (
  select distinct v.issue_document_id
  from public.production_stock_issue_report_lines_v v
  where v.issue_date = date '2026-09-28'
    and v.issue_type = 'KPF'
    and v.document_status = 'confirmed'
    and v.item_status = 'confirmed'
    and v.destination_room_code = 'BISCUIT_PACKING'
    and (
      (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
      or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
    )
)
update public.production_stock_issue_documents d
set destination_room_code = 'PACKING_400',
    destination_room_name_snapshot = 'ห้องบรรจุ 400',
    metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'destinationRoomCode', 'PACKING_400',
      'destinationRoomName', 'ห้องบรรจุ 400',
      'historicalCorrection', true,
      'historicalCorrectionKey', 'SEP28-WKB0045-WKB0048-PACKING400'
    )
from targets
where d.id = targets.issue_document_id;

update public.production_stock_movements m
set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
      'destinationRoomCode', 'PACKING_400',
      'destinationRoomName', 'ห้องบรรจุ 400',
      'historicalCorrection', true,
      'historicalCorrectionKey', 'SEP28-WKB0045-WKB0048-PACKING400'
    )
where m.source_document_type = 'stock_issue'
  and m.movement_type = 'issue_out'
  and m.source_document_no in (
    select d.issue_no
    from public.production_stock_issue_documents d
    join public.production_stock_issue_items i on i.issue_document_id = d.id
    where d.issue_date = date '2026-09-28'
      and d.issue_type = 'KPF'
      and d.status = 'confirmed'
      and i.status = 'confirmed'
      and d.destination_room_code = 'PACKING_400'
      and (
        (i.product_code = 'WKB-0045' and i.lot_no = '1509260045-1')
        or (i.product_code = 'WKB-0048' and i.lot_no = '2409260048-1')
      )
  );

do $$
declare
  v_rows integer;
  v_movements integer;
begin
  select count(*) into v_rows
  from public.production_stock_issue_report_lines_v v
  where v.issue_date = date '2026-09-28'
    and v.issue_type = 'KPF'
    and v.document_status = 'confirmed'
    and v.item_status = 'confirmed'
    and v.destination_room_code = 'PACKING_400'
    and v.destination_room_name_snapshot = 'ห้องบรรจุ 400'
    and (
      (v.product_code = 'WKB-0045' and v.lot_no = '1509260045-1')
      or (v.product_code = 'WKB-0048' and v.lot_no = '2409260048-1')
    );

  select count(*) into v_movements
  from public.production_stock_movements m
  where m.source_document_type = 'stock_issue'
    and m.movement_type = 'issue_out'
    and m.metadata ->> 'historicalCorrectionKey' = 'SEP28-WKB0045-WKB0048-PACKING400'
    and m.metadata ->> 'destinationRoomCode' = 'PACKING_400';

  if v_rows <> 49 or v_movements <> 49 then
    raise exception 'Verification failed: report rows %, movements %', v_rows, v_movements;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select *
from public.get_production_stock_activity_summary_by_room(
  '7bbac38b-362e-4131-9bc1-9b4b4b552ae2'::uuid,
  date '2026-09-28', date '2026-09-28', array['KPF']::text[],
  array['WKB-0045', 'WKB-0048']::text[]
)
order by product_code, lot_no, destination_room_code;
