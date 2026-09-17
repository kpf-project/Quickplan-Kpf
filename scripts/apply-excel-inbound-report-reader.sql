BEGIN;

CREATE SCHEMA IF NOT EXISTS reporting;
REVOKE ALL ON SCHEMA reporting FROM PUBLIC;

CREATE OR REPLACE VIEW reporting.piece_rate_inbound_report
WITH (security_barrier = true) AS
SELECT
  m.movement_date AS received_date,
  m.movement_at AT TIME ZONE 'Asia/Bangkok' AS received_at,
  COALESCE(NULLIF(m.metadata->>'labelBarcode', ''), NULLIF(m.metadata->>'barcode', ''), m.source_document_no, '') AS barcode,
  m.product_code,
  m.product_name_snapshot AS product_name,
  m.lot_no,
  CASE
    WHEN LOWER(TRIM(COALESCE(l.input_mode_snapshot, ''))) = 'pail' AND l.input_value > 0 THEN l.input_value
    ELSE m.quantity_in
  END AS quantity,
  m.weight_in_kg,
  COALESCE(NULLIF(m.metadata->>'employeeCode', ''), NULLIF(m.metadata->>'employee_code', ''), '') AS employee_code,
  COALESCE(NULLIF(m.metadata->>'employeeName', ''), NULLIF(m.metadata->>'employee_name', ''), NULLIF(l.employee_name_snapshot, ''), '') AS employee_name,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.production_piece_rate_stock_issues AS s
    WHERE s.piece_rate_barcode = COALESCE(NULLIF(m.metadata->>'labelBarcode', ''), NULLIF(m.metadata->>'barcode', ''), m.source_document_no, '')
      AND s.issue_status = 'confirmed'
  ) THEN 'เบิกแล้ว' ELSE 'พร้อมเบิก' END AS status
FROM public.production_stock_movements AS m
LEFT JOIN public.products_cache AS p ON p.sku_code = m.product_code
LEFT JOIN public.production_piece_rate_logs AS l ON l.doc_no = m.source_document_no
WHERE m.source_document_type IN ('piece_rate_weigh', 'piece_rate_prison_receipt')
  AND m.movement_date >= DATE '2026-08-11'
  AND COALESCE(NULLIF(p.iccat_code, ''), NULLIF(m.category_code, ''), '03') NOT IN ('04', '04-1', '04-2')
  AND NOT EXISTS (
    SELECT 1
    FROM public.production_stock_movements AS v
    WHERE v.source_document_type = 'piece_rate_weigh_void'
      AND v.source_document_no = m.source_document_no
  );

REVOKE ALL ON reporting.piece_rate_inbound_report FROM PUBLIC;

DO $setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'excel_report_reader') THEN
    CREATE ROLE excel_report_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$setup$;

ALTER ROLE excel_report_reader NOLOGIN;
GRANT CONNECT ON DATABASE postgres TO excel_report_reader;
GRANT USAGE ON SCHEMA reporting TO excel_report_reader;
GRANT SELECT ON reporting.piece_rate_inbound_report TO excel_report_reader;

COMMIT;

SELECT
  has_schema_privilege('excel_report_reader', 'reporting', 'USAGE') AS can_use_reporting,
  has_table_privilege('excel_report_reader', 'reporting.piece_rate_inbound_report', 'SELECT') AS can_read_report,
  has_table_privilege('excel_report_reader', 'public.production_stock_movements', 'SELECT') AS can_read_source,
  has_table_privilege('excel_report_reader', 'reporting.piece_rate_inbound_report', 'INSERT') AS can_write_report;
