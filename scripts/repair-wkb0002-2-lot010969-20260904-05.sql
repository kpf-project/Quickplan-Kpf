-- Reallocate 96.533 kg of WKB-0002-2 LOT 010969 from 2026-09-04 to 2026-09-05.
-- Dry-run by default through scripts/stock-fix-sql.mjs; pass --apply to commit.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select pg_advisory_xact_lock(hashtextextended('WKB-0002-2|010969', 0));

do $$
begin
  if not exists (
    select 1
    from public.production_piece_rate_prison_issue_items i
    join public.production_piece_rate_prison_issues h on h.id = i.issue_id
    where i.id = '64743480-5894-461d-a0d5-1e7a9339db97'
      and h.id = '98d6c376-ef04-4f42-8da8-649c5e860415'
      and h.issue_date = date '2026-09-04'
      and h.total_tray_quantity = 103.393
      and h.total_weight_kg = 2059.860
      and i.lot_no = '010969'
      and i.tray_quantity = 55.979
      and i.weight_kg = 1112.093
      and i.stock_movement_id = '45fb7bd5-71e3-4139-a194-a0523be24bec'
  ) then
    raise exception '2026-09-04 issue precondition failed; no data changed';
  end if;

  if not exists (
    select 1
    from public.production_piece_rate_prison_issue_items i
    join public.production_piece_rate_prison_issues h on h.id = i.issue_id
    where i.id = '1a820330-e7c2-4a48-8b8b-2c0e9d87966c'
      and h.id = '8bbf6784-c794-4149-ba8a-27825b76014a'
      and h.issue_date = date '2026-09-05'
      and h.total_tray_quantity = 130.021
      and h.total_weight_kg = 2576.917
      and i.lot_no = '010969'
      and i.tray_quantity = 34.021
      and i.weight_kg = 675.877
      and i.stock_movement_id = '08c91714-ccff-499c-8cfb-0c2aed9deefb'
  ) then
    raise exception '2026-09-05 issue precondition failed; no data changed';
  end if;

  if not exists (
    select 1 from public.production_stock_movements
    where id = '45fb7bd5-71e3-4139-a194-a0523be24bec'
      and movement_date = date '2026-09-04'
      and product_code = 'WKB-0002-2'
      and lot_no = '010969'
      and quantity_out = 55.979
      and weight_out_kg = 1112.093
      and source_document_type = 'piece_rate_prison_issue'
  ) or not exists (
    select 1 from public.production_stock_movements
    where id = '08c91714-ccff-499c-8cfb-0c2aed9deefb'
      and movement_date = date '2026-09-05'
      and product_code = 'WKB-0002-2'
      and lot_no = '010969'
      and quantity_out = 34.021
      and weight_out_kg = 675.877
      and source_document_type = 'piece_rate_prison_issue'
  ) then
    raise exception 'Stock movement precondition failed; no data changed';
  end if;
end $$;

\if :APPLY
\copy (select jsonb_build_object('issue_headers',(select jsonb_agg(to_jsonb(h) order by h.issue_date) from public.production_piece_rate_prison_issues h where h.id in ('98d6c376-ef04-4f42-8da8-649c5e860415','8bbf6784-c794-4149-ba8a-27825b76014a')),'issue_items',(select jsonb_agg(to_jsonb(i) order by i.created_at) from public.production_piece_rate_prison_issue_items i where i.id in ('64743480-5894-461d-a0d5-1e7a9339db97','1a820330-e7c2-4a48-8b8b-2c0e9d87966c')),'stock_movements',(select jsonb_agg(to_jsonb(m) order by m.movement_date) from public.production_stock_movements m where m.id in ('45fb7bd5-71e3-4139-a194-a0523be24bec','08c91714-ccff-499c-8cfb-0c2aed9deefb')))) to '.backups/wkb0002-2-lot010969-20260904-05-before.json'
\endif

update public.production_piece_rate_prison_issue_items
set tray_quantity = 51.120,
    weight_kg = 1015.560
where id = '64743480-5894-461d-a0d5-1e7a9339db97';

update public.production_piece_rate_prison_issue_items
set tray_quantity = 38.880,
    weight_kg = 772.410
where id = '1a820330-e7c2-4a48-8b8b-2c0e9d87966c';

update public.production_stock_movements
set quantity_out = 51.120,
    weight_out_kg = 1015.560,
    metadata = metadata || jsonb_build_object(
      'actualWeightKg', 1015.560,
      'trayEquivalent', 51.120,
      'historicalRepair', true,
      'historicalRepairKey', 'WKB0002-2-010969-20260904-05-REALLOCATION'
    )
where id = '45fb7bd5-71e3-4139-a194-a0523be24bec';

update public.production_stock_movements
set quantity_out = 38.880,
    weight_out_kg = 772.410,
    metadata = metadata || jsonb_build_object(
      'actualWeightKg', 772.410,
      'trayEquivalent', 38.880,
      'historicalRepair', true,
      'historicalRepairKey', 'WKB0002-2-010969-20260904-05-REALLOCATION'
    )
where id = '08c91714-ccff-499c-8cfb-0c2aed9deefb';

update public.production_piece_rate_prison_issues h
set total_tray_quantity = totals.total_tray_quantity,
    total_weight_kg = totals.total_weight_kg,
    metadata = h.metadata || jsonb_build_object(
      'historicalRepair', true,
      'historicalRepairKey', 'WKB0002-2-010969-20260904-05-REALLOCATION'
    )
from (
  select issue_id,
         round(sum(tray_quantity), 3) as total_tray_quantity,
         round(sum(weight_kg), 3) as total_weight_kg
  from public.production_piece_rate_prison_issue_items
  where issue_id in (
    '98d6c376-ef04-4f42-8da8-649c5e860415',
    '8bbf6784-c794-4149-ba8a-27825b76014a'
  )
  group by issue_id
) totals
where h.id = totals.issue_id;

do $$
declare
  v_receipt_qty numeric;
  v_receipt_kg numeric;
  v_issue_qty numeric;
  v_issue_kg numeric;
begin
  if not exists (
    select 1
    from public.production_piece_rate_prison_issue_items i
    join public.production_piece_rate_prison_issues h on h.id = i.issue_id
    join public.production_stock_movements m on m.id = i.stock_movement_id
    where h.issue_date = date '2026-09-04'
      and i.id = '64743480-5894-461d-a0d5-1e7a9339db97'
      and i.tray_quantity = 51.120
      and i.weight_kg = 1015.560
      and m.quantity_out = 51.120
      and m.weight_out_kg = 1015.560
      and (m.metadata ->> 'actualWeightKg')::numeric = 1015.560
      and (m.metadata ->> 'trayEquivalent')::numeric = 51.120
  ) or not exists (
    select 1
    from public.production_piece_rate_prison_issue_items i
    join public.production_piece_rate_prison_issues h on h.id = i.issue_id
    join public.production_stock_movements m on m.id = i.stock_movement_id
    where h.issue_date = date '2026-09-05'
      and i.id = '1a820330-e7c2-4a48-8b8b-2c0e9d87966c'
      and i.tray_quantity = 38.880
      and i.weight_kg = 772.410
      and m.quantity_out = 38.880
      and m.weight_out_kg = 772.410
      and (m.metadata ->> 'actualWeightKg')::numeric = 772.410
      and (m.metadata ->> 'trayEquivalent')::numeric = 38.880
  ) then
    raise exception 'Linked issue verification failed';
  end if;

  if not exists (
    select 1 from public.production_piece_rate_prison_issues
    where id = '98d6c376-ef04-4f42-8da8-649c5e860415'
      and total_tray_quantity = 98.534
      and total_weight_kg = 1963.327
  ) or not exists (
    select 1 from public.production_piece_rate_prison_issues
    where id = '8bbf6784-c794-4149-ba8a-27825b76014a'
      and total_tray_quantity = 134.880
      and total_weight_kg = 2673.450
  ) then
    raise exception 'Issue header verification failed';
  end if;

  select round(sum(quantity_in), 3), round(sum(weight_in_kg), 3),
         round(sum(quantity_out), 3), round(sum(weight_out_kg), 3)
  into v_receipt_qty, v_receipt_kg, v_issue_qty, v_issue_kg
  from public.production_stock_movements
  where product_code = 'WKB-0002-2' and lot_no = '010969';

  if v_receipt_qty <> 90.000 or v_receipt_kg <> 1787.970
     or v_issue_qty <> 90.000 or v_issue_kg <> 1787.970 then
    raise exception 'LOT balance verification failed: in %/% out %/%',
      v_receipt_qty, v_receipt_kg, v_issue_qty, v_issue_kg;
  end if;

  if (
    select round(sum(weight_out_kg), 3)
    from public.production_stock_movements
    where product_code = 'WKB-0002-2'
      and lot_no = '020969'
      and movement_date = date '2026-09-05'
      and source_document_type = 'piece_rate_prison_issue'
  ) <> 1901.040 then
    raise exception 'LOT 020969 changed unexpectedly';
  end if;
end $$;

\if :APPLY
commit;
\else
rollback;
\endif

select m.movement_date,
       m.lot_no,
       round(sum(m.quantity_out), 3) as tray_quantity,
       round(sum(m.weight_out_kg), 3) as weight_kg
from public.production_stock_movements m
where m.product_code = 'WKB-0002-2'
  and m.lot_no in ('010969', '020969')
  and m.movement_date in (date '2026-09-04', date '2026-09-05')
  and m.source_document_type = 'piece_rate_prison_issue'
group by m.movement_date, m.lot_no
order by m.movement_date, m.lot_no;
