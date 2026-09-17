begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

create temp table target_log as
select *
from public.production_piece_rate_logs
where id = '4eea190c-237b-4594-a000-38c54586f09d'::uuid
  and doc_no = '20260909029'
for update;

do $$
begin
  if (select count(*) from target_log) <> 1 then
    raise exception 'Expected exactly one target log';
  end if;
  if exists (
    select 1 from target_log
    where employee_code <> 'KPF-00828'
       or raw_employee_qr_payload <> 'KPF-00828'
       or employee_name_snapshot <> 'TIN NYO ( ทิน โยว ) -'
       or actual_weighed_at <> timestamptz '2026-09-09 02:50:53.257+00'
  ) then
    raise exception 'Target log changed; refusing repair';
  end if;
end;
$$;

\if :APPLY
\copy (select to_jsonb(t) from target_log t) to '.backups/piece-rate-20260909029-employee-before.json'
\endif

update public.production_piece_rate_logs
set employee_code = '02225',
    raw_employee_qr_payload = '02225',
    employee_name_snapshot = 'SU MYAT MYAT LWIN (สุ เมียท เมียท ลวย)',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'employeeCorrection20260910', jsonb_build_object(
        'fromEmployeeCode', 'KPF-00828',
        'fromEmployeeName', 'TIN NYO ( ทิน โยว ) -',
        'toEmployeeCode', '02225',
        'toEmployeeName', 'SU MYAT MYAT LWIN (สุ เมียท เมียท ลวย)',
        'reason', 'ผู้ใช้งานยืนยันว่าเลือกพนักงานผิดในเอกสาร 20260909029',
        'correctedAt', now()
      )
    )
where id = '4eea190c-237b-4594-a000-38c54586f09d'::uuid;

do $$
begin
  if not exists (
    select 1
    from public.production_piece_rate_logs
    where id = '4eea190c-237b-4594-a000-38c54586f09d'::uuid
      and doc_no = '20260909029'
      and employee_code = '02225'
      and raw_employee_qr_payload = '02225'
      and employee_name_snapshot = 'SU MYAT MYAT LWIN (สุ เมียท เมียท ลวย)'
      and wage_amount_snapshot = 70.9875
      and actual_weighed_at = timestamptz '2026-09-09 02:50:53.257+00'
  ) then
    raise exception 'Employee repair verification failed';
  end if;
end;
$$;

select doc_no, employee_code, employee_name_snapshot, raw_employee_qr_payload,
       actual_weighed_at, wage_amount_snapshot
from public.production_piece_rate_logs
where id = '4eea190c-237b-4594-a000-38c54586f09d'::uuid;

\if :APPLY
commit;
\else
rollback;
\endif
