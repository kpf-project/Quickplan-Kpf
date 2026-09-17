SELECT
  issue_date AS "วันที่เบิก",
  issued_at AS "วันเวลาเบิก",
  barcode AS "บาร์โค้ดป้าย",
  product_code AS "รหัสสินค้า WIP",
  product_name AS "ชื่อสินค้า WIP",
  lot_no AS "LOT",
  quantity AS "จำนวน",
  weight_kg AS "น้ำหนัก (กก.)",
  fg_product_code AS "รหัสสินค้า FG",
  fg_product_name AS "ชื่อสินค้า FG",
  employee_code AS "รหัสพนักงาน",
  employee_name AS "ชื่อพนักงาน",
  status AS "สถานะ"
FROM reporting.piece_rate_issue_report
WHERE issue_date BETWEEN DATE '2026-09-01' AND DATE '2026-09-15'
ORDER BY issued_at DESC
LIMIT 2000;
