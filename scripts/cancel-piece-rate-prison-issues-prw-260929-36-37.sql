-- Cancel the exact two-line prison issue document requested by the operator.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('piece-rate-prison-issue|c6812743-081a-4256-a931-fa83d8ae8fbe', 0));

do $$
begin
  if not exists (
    select 1
    from public.production_piece_rate_prison_issues h
    where h.id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
      and h.issue_no = 'PRWISS-20261001-165234444-C5E330'
      and h.issue_date = date '2026-09-29'
      and h.product_code = 'WKB-0002-2'
      and h.fg_product_code = 'BL0-5001'
      and h.total_tray_quantity = 176.995
      and h.total_weight_kg = 3526.390
      and h.item_count = 2
  ) then
    raise exception 'Prison issue header precondition failed; no data changed';
  end if;

  if (select count(*) from public.production_piece_rate_prison_issue_items
      where issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe') <> 2
     or not exists (
       select 1
       from public.production_piece_rate_prison_issue_items i
       join public.production_stock_movements m on m.id = i.stock_movement_id
       where i.id = 'a2acd226-3e7c-4809-9a98-c2453fe4cf63'
         and i.issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
         and i.line_no = 1 and i.lot_no = '240926'
         and i.tray_quantity = 81.997 and i.weight_kg = 1627.080
         and m.id = 'fa06e5ea-54cc-4e25-b884-34bafc7fffa4'
         and m.source_document_type = 'piece_rate_prison_issue'
         and m.source_document_no = 'PRW-260929-000036-01'
         and m.quantity_out = 81.997 and m.weight_out_kg = 1627.080
     )
     or not exists (
       select 1
       from public.production_piece_rate_prison_issue_items i
       join public.production_stock_movements m on m.id = i.stock_movement_id
       where i.id = '71546e6e-acf4-4f07-89fd-0db63d611f10'
         and i.issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
         and i.line_no = 2 and i.lot_no = '250926'
         and i.tray_quantity = 94.998 and i.weight_kg = 1899.310
         and m.id = '50c1a508-68e4-412f-ae8c-dbaad7adcb1b'
         and m.source_document_type = 'piece_rate_prison_issue'
         and m.source_document_no = 'PRW-260929-000037-02'
         and m.quantity_out = 94.998 and m.weight_out_kg = 1899.310
     ) then
    raise exception 'Prison issue item precondition failed; no data changed';
  end if;

  if exists (
    select 1 from public.production_piece_rate_logs
    where stock_movement_id in (
      'fa06e5ea-54cc-4e25-b884-34bafc7fffa4',
      '50c1a508-68e4-412f-ae8c-dbaad7adcb1b'
    )
  ) or exists (
    select 1 from public.production_piece_rate_stock_issues
    where stock_movement_id in (
      'fa06e5ea-54cc-4e25-b884-34bafc7fffa4',
      '50c1a508-68e4-412f-ae8c-dbaad7adcb1b'
    )
  ) or exists (
    select 1 from public.production_piece_rate_stock_returns
    where stock_movement_id in (
      'fa06e5ea-54cc-4e25-b884-34bafc7fffa4',
      '50c1a508-68e4-412f-ae8c-dbaad7adcb1b'
    )
  ) then
    raise exception 'Downstream stock history exists; no data changed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('issue_header',(select to_jsonb(h) from public.production_piece_rate_prison_issues h where h.id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'),'issue_items',(select jsonb_agg(to_jsonb(i) order by i.line_no) from public.production_piece_rate_prison_issue_items i where i.issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'),'stock_movements',(select jsonb_agg(to_jsonb(m) order by m.source_document_no) from public.production_stock_movements m where m.id in ('fa06e5ea-54cc-4e25-b884-34bafc7fffa4','50c1a508-68e4-412f-ae8c-dbaad7adcb1b')))) to '.backups/prison-issues-prw-260929-36-37-before.json'
\endif

insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
select
  h.issued_by,
  'cancel_piece_rate_prison_issue_data_correction',
  'production_piece_rate_prison_issues',
  h.id,
  jsonb_build_object(
    'reason', 'ผู้ใช้ขอยกเลิกรายการเบิกเรือนจำที่บันทึกผิด',
    'cancelledBarcodes', jsonb_build_array('PRW-260929-000036-01', 'PRW-260929-000037-02'),
    'before', jsonb_build_object(
      'header', to_jsonb(h),
      'items', (select jsonb_agg(to_jsonb(i) order by i.line_no)
                from public.production_piece_rate_prison_issue_items i where i.issue_id = h.id),
      'movements', (select jsonb_agg(to_jsonb(m) order by m.source_document_no)
                    from public.production_stock_movements m
                    where m.id in ('fa06e5ea-54cc-4e25-b884-34bafc7fffa4','50c1a508-68e4-412f-ae8c-dbaad7adcb1b'))
    )
  )
from public.production_piece_rate_prison_issues h
where h.id = 'c6812743-081a-4256-a931-fa83d8ae8fbe';

delete from public.production_piece_rate_prison_issue_items
where issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe';

delete from public.production_stock_movements
where id in (
  'fa06e5ea-54cc-4e25-b884-34bafc7fffa4',
  '50c1a508-68e4-412f-ae8c-dbaad7adcb1b'
);

delete from public.production_piece_rate_prison_issues
where id = 'c6812743-081a-4256-a931-fa83d8ae8fbe';

do $$
declare
  v_lot_240926_qty numeric;
  v_lot_240926_kg numeric;
  v_lot_250926_qty numeric;
  v_lot_250926_kg numeric;
begin
  if exists (
    select 1 from public.production_stock_movements
    where source_document_no in ('PRW-260929-000036-01', 'PRW-260929-000037-02')
  ) or exists (
    select 1 from public.production_piece_rate_prison_issues
    where id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
  ) or exists (
    select 1 from public.production_piece_rate_prison_issue_items
    where issue_id = 'c6812743-081a-4256-a931-fa83d8ae8fbe'
  ) then
    raise exception 'Cancellation verification failed';
  end if;

  select round(sum(quantity_in - quantity_out), 3),
         round(sum(weight_in_kg - weight_out_kg), 3)
  into v_lot_240926_qty, v_lot_240926_kg
  from public.production_stock_movements
  where product_code = 'WKB-0002-2' and lot_no = '240926';

  select round(sum(quantity_in - quantity_out), 3),
         round(sum(weight_in_kg - weight_out_kg), 3)
  into v_lot_250926_qty, v_lot_250926_kg
  from public.production_stock_movements
  where product_code = 'WKB-0002-2' and lot_no = '250926';

  if v_lot_240926_qty <> 82.000 or v_lot_240926_kg <> 1627.130
     or v_lot_250926_qty <> 100.000 or v_lot_250926_kg <> 1999.310 then
    raise exception 'Restored LOT balance verification failed: 240926 %/%; 250926 %/%',
      v_lot_240926_qty, v_lot_240926_kg, v_lot_250926_qty, v_lot_250926_kg;
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select source_document_no, source_document_type, quantity_out, weight_out_kg
from public.production_stock_movements
where source_document_no in ('PRW-260929-000036-01', 'PRW-260929-000037-02')
order by source_document_no;
