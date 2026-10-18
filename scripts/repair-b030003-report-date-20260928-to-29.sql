begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temp table before_logs as
select *
from public.production_piece_rate_logs
where product_goods_code_snapshot = 'B03-0003'
  and lot_no = '2909260003-1'
  and (actual_weighed_at at time zone 'Asia/Bangkok')::date = date '2026-09-28'
  and (logged_at at time zone 'Asia/Bangkok')::date = date '2026-09-29'
  and (doc_status = 'active' or doc_status is null)
  and replaced_by_log_id is null
for update;

create temp table before_movements as
select m.*
from public.production_stock_movements m
join before_logs l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from before_logs) <> 67
     or (select min(doc_no) from before_logs) <> '20260929054'
     or (select max(doc_no) from before_logs) <> '20260929120'
     or (select sum(count_value_snapshot) from before_logs) <> 67
     or (select round(sum(normalized_kg_amount_snapshot)::numeric, 3) from before_logs) <> 335.150 then
    raise exception 'Piece-rate precondition failed';
  end if;

  if (select count(*) from before_movements) <> 67
     or exists (
       select 1 from before_movements
       where movement_type <> 'receipt_in'
          or movement_date <> date '2026-09-28'
          or product_code <> 'B03-0003'
          or lot_no <> '2909260003-1'
     )
     or (select sum(quantity_in) from before_movements) <> 67
     or (select round(sum(weight_in_kg)::numeric, 3) from before_movements) <> 335.150 then
    raise exception 'Stock movement precondition failed';
  end if;

  if exists (
    select 1
    from public.production_piece_rate_stock_issues i
    join before_logs l on l.id = i.piece_rate_log_id
  ) or exists (
    select 1
    from public.production_piece_rate_stock_returns r
    join before_logs l on l.id = r.piece_rate_log_id
  ) then
    raise exception 'Downstream stock issue or return exists';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('logs', (select jsonb_agg(to_jsonb(l) order by l.doc_no) from before_logs l), 'movements', (select jsonb_agg(to_jsonb(m) order by m.source_document_no) from before_movements m))) to '.backups/b030003-report-date-20260928-to-29-before.json'
\endif

update public.production_piece_rate_logs l
set metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(b.metadata, '{}'::jsonb),
          '{scaleAudit,physicalCapturedAt}',
          to_jsonb(to_char((b.actual_weighed_at + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
          true
        ),
        '{scaleAudit,capturedAt}',
        to_jsonb(to_char((b.actual_weighed_at + interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        true
      ),
      '{workDate}',
      to_jsonb('2026-09-29'::text),
      true
    ) || jsonb_build_object(
      'reportDateCorrection20260929', jsonb_build_object(
        'fromWorkDate', '2026-09-28',
        'toWorkDate', '2026-09-29',
        'reason', 'หน้างานเลือกวันที่ 28 ผิด ผู้ใช้ยืนยันให้ย้าย B03-0003 LOT 2909260003-1 ทั้งหมดไปวันที่รับเข้าจริง 29/09/2569',
        'correctedAt', now()
      )
    )
from before_logs b
where l.id = b.id;

update public.production_stock_movements m
set movement_date = date '2026-09-29',
    movement_at = b.movement_at + interval '1 day'
from before_movements b
where m.id = b.id;

insert into public.production_piece_rate_log_revisions (
  log_id, action, before_data, after_data, edited_by, edit_reason
)
select
  b.id,
  'update',
  to_jsonb(b),
  to_jsonb(l),
  null,
  'ย้าย B03-0003 LOT 2909260003-1 จากวันที่รายงาน 28/09/2569 ไปวันที่รับเข้าจริง 29/09/2569 พร้อมรายการรับเข้าสต็อก'
from before_logs b
join public.production_piece_rate_logs l on l.id = b.id;

do $$
begin
  if exists (
    select 1
    from before_logs b
    join public.production_piece_rate_logs l on l.id = b.id
    where (l.actual_weighed_at at time zone 'Asia/Bangkok')::date <> date '2026-09-29'
       or l.metadata ->> 'workDate' <> '2026-09-29'
       or to_jsonb(l) - array['actual_weighed_at', 'metadata', 'updated_at']
          is distinct from to_jsonb(b) - array['actual_weighed_at', 'metadata', 'updated_at']
  ) then
    raise exception 'Piece-rate verification failed';
  end if;

  if exists (
    select 1
    from before_movements b
    join public.production_stock_movements m on m.id = b.id
    where m.movement_date <> date '2026-09-29'
       or (m.movement_at at time zone 'Asia/Bangkok')::date <> date '2026-09-29'
       or to_jsonb(m) - array['movement_date', 'movement_at', 'updated_at']
          is distinct from to_jsonb(b) - array['movement_date', 'movement_at', 'updated_at']
  ) then
    raise exception 'Stock movement verification failed';
  end if;
end;
$$;

select
  (actual_weighed_at at time zone 'Asia/Bangkok')::date as report_date,
  product_goods_code_snapshot as product_code,
  lot_no,
  count(*) as documents,
  sum(count_value_snapshot) as quantity,
  round(sum(normalized_kg_amount_snapshot)::numeric, 3) as weight_kg
from public.production_piece_rate_logs
where id in (select id from before_logs)
group by 1, 2, 3;

select
  movement_date,
  product_code,
  lot_no,
  count(*) as movements,
  sum(quantity_in) as quantity,
  round(sum(weight_in_kg)::numeric, 3) as weight_kg
from public.production_stock_movements
where id in (select id from before_movements)
group by 1, 2, 3;

\if :APPLY
commit;
\else
rollback;
\endif
