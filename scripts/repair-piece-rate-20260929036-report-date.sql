begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table before_log as
select *
from public.production_piece_rate_logs
where id = '10588a0b-54f6-40f7-9f60-3169df32de65'::uuid
  and doc_no = '20260929036'
for update;

create temp table before_movement as
select m.*
from public.production_stock_movements m
join before_log l on l.stock_movement_id = m.id
for update;

do $$
begin
  if (select count(*) from before_log) <> 1 or not exists (
    select 1
    from before_log
    where employee_code = 'KPF-01300'
      and employee_name_snapshot = 'NILAR WIN (นีลา วิน)'
      and product_goods_code_snapshot = 'BL0-1104'
      and input_value = 134
      and normalized_kg_amount_snapshot = 147.4
      and lot_no = '2909261104-1'
      and doc_status = 'active'
      and logged_at = timestamptz '2026-09-29 01:45:18.361+00'
      and actual_weighed_at = timestamptz '2026-09-29 01:45:17.187+00'
  ) then
    raise exception 'Document precondition failed';
  end if;

  if (select count(*) from before_movement) <> 1 or not exists (
    select 1
    from before_movement
    where movement_type = 'receipt_in'
      and movement_date = date '2026-09-29'
      and source_document_no = '20260929036'
      and product_code = 'BL0-1104'
      and lot_no = '2909261104-1'
      and weight_in_kg = 147.4
  ) then
    raise exception 'Stock movement precondition failed';
  end if;

  if exists (
    select 1
    from public.production_piece_rate_stock_issues i
    join before_log l on l.id = i.piece_rate_log_id
  ) or exists (
    select 1
    from public.production_piece_rate_stock_returns r
    join before_log l on l.id = r.piece_rate_log_id
  ) then
    raise exception 'Downstream stock issue or return exists';
  end if;
end;
$$;

\if :APPLY
\copy (select jsonb_build_object('log', (select to_jsonb(l) from before_log l), 'movement', (select to_jsonb(m) from before_movement m))) to '.backups/piece-rate-20260929036-report-date-before.json'
\endif

update public.production_piece_rate_logs
set metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{scaleAudit,physicalCapturedAt}',
        to_jsonb(coalesce(metadata #>> '{scaleAudit,physicalCapturedAt}', metadata #>> '{scaleAudit,capturedAt}')),
        true
      ),
      '{scaleAudit,capturedAt}',
      to_jsonb('2026-09-28T01:45:17.187Z'::text),
      true
    )
      || jsonb_build_object(
        'workDate', '2026-09-28',
        'reportDateCorrection20260929', jsonb_build_object(
          'fromWorkDate', '2026-09-29',
          'toWorkDate', '2026-09-28',
          'reason', 'ผู้ใช้ยืนยันให้นำงานของ NILAR WIN เอกสาร 20260929036 ไปแสดงในรายงานวันที่ 28/09/2569 โดยคงฉลาก LOT เลขเอกสาร และสต็อกเดิม',
          'correctedAt', now()
        )
      )
where id in (select id from before_log);

insert into public.production_piece_rate_log_revisions (
  log_id, action, before_data, after_data, edited_by, edit_reason
)
select
  b.id,
  'update',
  to_jsonb(b),
  to_jsonb(l),
  null,
  'ย้ายเฉพาะวันที่แสดงรายงานจาก 29/09/2569 เป็น 28/09/2569; คงเลขเอกสาร LOT บาร์โค้ด เวลาเซิร์ฟเวอร์ และรายการสต็อกเดิม'
from before_log b
join public.production_piece_rate_logs l on l.id = b.id;

do $$
begin
  if exists (
    select 1
    from before_log b
    join public.production_piece_rate_logs l on l.id = b.id
    where to_jsonb(l) - array['actual_weighed_at', 'metadata']
          is distinct from to_jsonb(b) - array['actual_weighed_at', 'metadata']
       or l.actual_weighed_at <> timestamptz '2026-09-28 01:45:17.187+00'
       or l.metadata ->> 'workDate' <> '2026-09-28'
  ) then
    raise exception 'Unrelated piece-rate data changed';
  end if;

  if exists (
    select 1
    from before_movement b
    join public.production_stock_movements m on m.id = b.id
    where to_jsonb(m) is distinct from to_jsonb(b)
  ) then
    raise exception 'Stock movement changed unexpectedly';
  end if;
end;
$$;

select
  l.doc_no,
  l.employee_code,
  l.product_goods_code_snapshot,
  l.input_value,
  l.normalized_kg_amount_snapshot,
  l.lot_no,
  l.logged_at,
  l.actual_weighed_at,
  l.metadata ->> 'workDate' as work_date,
  m.movement_date,
  m.movement_at
from public.production_piece_rate_logs l
join public.production_stock_movements m on m.id = l.stock_movement_id
where l.id in (select id from before_log);

\if :APPLY
commit;
\else
rollback;
\endif
