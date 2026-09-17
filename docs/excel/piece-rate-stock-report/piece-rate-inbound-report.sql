-- รายงานรับเข้า WIP (อ่านอย่างเดียว)
-- PostgreSQL Server: 192.168.210.185  Port: 5532
-- Database: postgres  Username: excel_report_reader
-- Password: รับจากผู้ดูแลระบบและบันทึกใน ODBC/Excel ครั้งแรก
-- ดึงข้อมูลทั้งหมด ผู้ใช้งานสามารถเพิ่ม WHERE เพื่อกรองเองได้
SELECT
  received_date AS "วันที่รับเข้า",
  TO_CHAR(received_at, 'DD/MM/YYYY HH24:MI:SS') AS "วันเวลารับเข้า",
  barcode AS "บาร์โค้ด",
  product_code AS "รหัสสินค้า",
  product_name AS "ชื่อสินค้า",
  lot_no AS "LOT",
  quantity AS "จำนวน",
  weight_in_kg AS "น้ำหนัก (กก.)",
  employee_code AS "รหัสพนักงาน",
  employee_name AS "ชื่อพนักงาน",
  status AS "สถานะ"
FROM reporting.piece_rate_inbound_report
ORDER BY received_at DESC;
