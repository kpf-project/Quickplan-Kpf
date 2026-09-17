begin read only;

select
  id,
  doc_no,
  request_id,
  employee_code,
  employee_name_snapshot,
  raw_employee_qr_payload,
  logged_at,
  actual_weighed_at,
  doc_status,
  wage_amount_snapshot,
  metadata
from public.production_piece_rate_logs
where doc_no = '20260909029';

select
  employee_code,
  employee_name_snapshot,
  raw_employee_qr_payload,
  count(*) as scan_count,
  min(logged_at) as first_scan,
  max(logged_at) as last_scan
from public.production_piece_rate_logs
where employee_code in ('KPF-00828', '00828', 'KPF-02225', '02225')
   or raw_employee_qr_payload in ('KPF-00828', '00828', 'KPF-02225', '02225')
group by employee_code, employee_name_snapshot, raw_employee_qr_payload
order by max(logged_at) desc;

commit;
