BEGIN;

CREATE OR REPLACE VIEW reporting.piece_rate_issue_report
WITH (security_barrier = true) AS
SELECT
  m.movement_date AS issue_date,
  m.movement_at AT TIME ZONE 'Asia/Bangkok' AS issued_at,
  COALESCE(NULLIF(m.metadata->>'labelBarcode', ''), NULLIF(m.metadata->>'barcode', ''), m.source_document_no, '') AS barcode,
  m.product_code,
  m.product_name_snapshot AS product_name,
  m.lot_no,
  CASE WHEN m.source_document_type = 'piece_rate_issue_void' THEN m.quantity_in ELSE m.quantity_out END AS quantity,
  CASE WHEN m.source_document_type = 'piece_rate_issue_void' THEN m.weight_in_kg ELSE m.weight_out_kg END AS weight_kg,
  NULLIF(m.metadata->>'fgProductCode', '') AS fg_product_code,
  COALESCE(NULLIF(m.metadata->>'fgProductName', ''), fg.sku_name, NULLIF(m.metadata->>'fgProductCode', '')) AS fg_product_name,
  COALESCE(NULLIF(m.metadata->>'issueEmployeeCode', ''), NULLIF(m.metadata->>'employeeCode', ''), '') AS employee_code,
  COALESCE(NULLIF(m.metadata->>'issueEmployeeName', ''), NULLIF(m.metadata->>'employeeName', ''), '') AS employee_name,
  CASE WHEN m.source_document_type = 'piece_rate_issue_void' THEN 'ยกเลิกเบิก' ELSE 'เบิกสำเร็จ' END AS status
FROM public.production_stock_movements AS m
LEFT JOIN public.products_cache AS fg
  ON fg.sku_code = NULLIF(m.metadata->>'fgProductCode', '')
WHERE m.source_document_type IN ('piece_rate_issue', 'piece_rate_issue_void')
  AND m.movement_date >= DATE '2026-08-11'
  AND (
    m.source_document_type = 'piece_rate_issue_void'
    OR NOT EXISTS (
      SELECT 1
      FROM public.production_stock_movements AS v
      WHERE v.source_document_type = 'piece_rate_issue_void'
        AND UPPER(TRIM(COALESCE(v.source_document_no, v.reference_no, ''))) = UPPER(TRIM(COALESCE(m.source_document_no, '')))
    )
  );

REVOKE ALL ON reporting.piece_rate_issue_report FROM PUBLIC;
GRANT SELECT ON reporting.piece_rate_issue_report TO excel_report_reader;

COMMIT;

SELECT
  has_table_privilege('excel_report_reader', 'reporting.piece_rate_issue_report', 'SELECT') AS can_read_report,
  has_table_privilege('excel_report_reader', 'reporting.piece_rate_issue_report', 'INSERT') AS can_write_report,
  (SELECT COUNT(*) FROM reporting.piece_rate_issue_report) AS report_rows;
