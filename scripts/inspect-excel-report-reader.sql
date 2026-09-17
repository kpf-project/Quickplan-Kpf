BEGIN;
SET LOCAL ROLE excel_report_reader;

SELECT
  current_user AS reader_role,
  COUNT(*) AS inbound_rows,
  MIN(received_date) AS first_date,
  MAX(received_date) AS last_date
FROM reporting.piece_rate_inbound_report
WHERE received_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-15';

ROLLBACK;
