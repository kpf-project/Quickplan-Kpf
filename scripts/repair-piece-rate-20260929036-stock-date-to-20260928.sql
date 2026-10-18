begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table before_movement as
select m.*
from public.production_stock_movements m
join public.production_piece_rate_logs l on l.stock_movement_id = m.id
where l.id = '10588a0b-54f6-40f7-9f60-3169df32de65'::uuid
  and l.doc_no = '20260929036'
  and l.product_goods_code_snapshot = 'BL0-1104'
  and l.lot_no = '2909261104-1'
  and l.actual_weighed_at = timestamptz '2026-09-28 01:45:17.187+00'
for update;

do $$
begin
  if (select count(*) from before_movement) <> 1 or not exists (
    select 1 from before_movement
    where id = 'fe008a64-b06c-464c-9ce4-f491d083d8d8'::uuid
      and movement_type = 'receipt_in'
      and movement_date = date '2026-09-29'
      and movement_at = timestamptz '2026-09-29 01:45:17.187+00'
      and source_document_no = '20260929036'
      and product_code = 'BL0-1104'
      and lot_no = '2909261104-1'
      and quantity_in = 1
      and weight_in_kg = 147.4
  ) then
    raise exception 'Stock movement precondition failed';
  end if;

  if exists (
    select 1 from public.production_piece_rate_stock_issues
    where piece_rate_log_id = '10588a0b-54f6-40f7-9f60-3169df32de65'::uuid
  ) or exists (
    select 1 from public.production_piece_rate_stock_returns
    where piece_rate_log_id = '10588a0b-54f6-40f7-9f60-3169df32de65'::uuid
  ) then
    raise exception 'Downstream stock issue or return exists';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(m) from before_movement m) to '.backups/piece-rate-20260929036-stock-date-before.json'
\endif

update public.production_stock_movements m
set movement_date = date '2026-09-28',
    movement_at = timestamptz '2026-09-28 01:45:17.187+00'
from before_movement b
where m.id = b.id;

do $$
begin
  if exists (
    select 1
    from before_movement b
    join public.production_stock_movements m on m.id = b.id
    where m.movement_date <> date '2026-09-28'
       or m.movement_at <> timestamptz '2026-09-28 01:45:17.187+00'
       or to_jsonb(m) - array['movement_date', 'movement_at', 'updated_at']
          is distinct from to_jsonb(b) - array['movement_date', 'movement_at', 'updated_at']
  ) then
    raise exception 'Stock movement verification failed';
  end if;
end;
$$;

select movement_date, movement_at, source_document_no, product_code, lot_no, quantity_in, weight_in_kg
from public.production_stock_movements
where id in (select id from before_movement);

\if :APPLY
commit;
\else
rollback;
\endif
