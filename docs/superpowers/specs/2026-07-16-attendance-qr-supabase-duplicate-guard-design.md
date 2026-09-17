# Attendance QR Supabase Duplicate Guard Design

## Objective

แก้ระบบสแกนเข้า–ออกงานที่ `/production-line/attendance/scan` ให้การตัดสินรับหรือปฏิเสธรายการอ้างอิงเฉพาะประวัติ QR ใน Supabase ตาราง `attendance_scan_events` และไม่ใช้ข้อมูลจาก `Pm2014_SU.dbo.CHECKINOUT`

## Source Separation

- QR เข้า–ออกงาน: บันทึกและตรวจสถานะจาก `attendance_scan_events`
- Employee master: ใช้ค้นรหัส ชื่อ แผนก และสาขาเท่านั้น
- เครื่องสแกนนิ้ว: ไม่ถูกเรียกและไม่มีผลต่อ flow การบันทึก QR
- รายงานที่แสดงข้อมูลเครื่องสแกนนิ้วเดิมอยู่นอกขอบเขตและไม่ถูกแก้

## Business Day

ระบบใช้วันตาม `Asia/Bangkok` จากเวลาฝั่งเซิร์ฟเวอร์ ไม่ใช้วัน UTC จาก `toISOString().slice(0, 10)` และไม่เชื่อวันจากเครื่องผู้ใช้เป็นแหล่งตัดสิน

ขอบเขตหนึ่งวันคือเวลาไทย `00:00:00` จนถึงก่อน `00:00:00` ของวันถัดไป

## Employee Identity

QR ถูกแปลงเป็น canonical employee key โดยใช้กติกาเดิมที่ตัด `KPF` และเครื่องหมายออก และเติมรหัสตัวเลขให้ครบห้าหลัก เพื่อให้ `KPF-123`, `KPF00123` และ `00123` หมายถึงพนักงานคนเดียวกัน

ข้อมูลชื่อ แผนก และสาขาอ่านจาก employee master endpoint `/api/employees` แล้วเลือกผลที่ canonical key ตรงกันเท่านั้น ไม่ใช้ `/api/consolidated-lookup`

## Duplicate Rules

สำหรับพนักงานหนึ่งคนในหนึ่งวันเวลาไทย:

- `IN`: บันทึกได้หนึ่งรายการสถานะ `accepted`; หากมีแล้วให้ตอบ `already_checked_in`
- `OUT`: บันทึกได้หนึ่งรายการสถานะ `accepted`; หากมีแล้วให้ตอบ `already_checked_out`
- `OUT` ที่ยังไม่มี `IN`: ใช้ dialog ยืนยันเดิม; เมื่อผู้ใช้ยืนยันจึงบันทึก `OUT`
- รายการ `rejected` หรือ `duplicate` ไม่ถูกนับเป็นเวลาเข้า–ออกที่สำเร็จ
- `request_id` เดิมยังคงทำหน้าที่ idempotency สำหรับคำขอเดียวกัน

## Atomic Protection

เพิ่มคอลัมน์ nullable ให้ `attendance_scan_events`:

- `employee_code_key text`
- `scan_business_date date`

สร้าง partial unique index บน `(employee_code_key, event_type, scan_business_date)` เฉพาะรายการ `status = 'accepted'` ที่คีย์ทั้งสองไม่เป็น null เพื่อป้องกันสองอุปกรณ์บันทึกพร้อมกัน

ประวัติเดิมไม่ถูก backfill หรือแก้ไข จึงไม่เสี่ยงชน unique index รายการใหม่จะบันทึกสองคอลัมน์นี้เสมอ ก่อน insert ฝั่งเซิร์ฟเวอร์จะอ่านรายการ accepted ของวันไทยและเทียบ canonical key เพื่อให้ตรวจพบรายการเดิมที่สร้างก่อน migration ด้วย

## Snapshot and Response

- `employee_name_snapshot`, `department_snapshot`, `branch_snapshot` มาจาก employee master
- `check_in_snapshot` และ `check_out_snapshot` มาจากเวลา QR ใน Supabase เท่านั้น
- หลัง `IN` response แสดงเวลา QR เข้าและ `OUT` เป็น `-`
- หลัง `OUT` response แสดงเวลา QR เข้าเดิมและเวลา QR ออกใหม่

## Failure Handling

- ไม่พบพนักงาน: ตอบ 404 และไม่ insert
- อ่าน Supabase ไม่สำเร็จ: ตอบ 500 และไม่เดาสถานะ
- unique conflict จาก business key: แปลงเป็นข้อความสแกนซ้ำที่ตรงกับ `IN` หรือ `OUT`
- unique conflict จาก `request_id`: คืนรายการเดิมแบบ idempotent ตาม behavior ปัจจุบัน

## Scope

แก้เฉพาะ service ของ QR attendance, migration สำหรับ atomic key และ regression tests ที่เกี่ยวข้อง ไม่แก้หน้าเครื่องสแกนนิ้ว ไม่แก้ข้อมูลย้อนหลัง และไม่แก้รายงาน attendance ที่รวมข้อมูลหลายแหล่ง

## Verification

- ทดสอบว่า service ไม่เรียก `/api/consolidated-lookup` และไม่อ่าน `snapshot.check_in_snapshot/check_out_snapshot`
- ทดสอบขอบเขตวันกรุงเทพ โดยเฉพาะช่วง `00:00–06:59`
- ทดสอบ `IN` ครั้งแรกสำเร็จและครั้งที่สองถูกปฏิเสธ
- ทดสอบ `OUT` ก่อน `IN`, `OUT` หลัง `IN` และ `OUT` ซ้ำ
- ทดสอบ alias ของรหัสพนักงาน
- รัน focused tests, ESLint และ production build

