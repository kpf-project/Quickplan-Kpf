# ถอด daily-scan และ work-types — 5 กันยายน 2569

## ขอบเขต

- ถอดหน้าบันทึก `attendance/daily-scan` และ route รายงานเก่า `attendance/report/daily-work`
- ถอด API `attendance/daily-work` และ `production-work-types` รวม route ย่อย
- ถอด service/client และตัวช่วยประเภทงานที่ตรวจพบว่าใช้เฉพาะงานนี้
- ถอดแท็บ work-types และเฉพาะ alias สิทธิ์ของแท็บนี้
- เก็บแท็บ piece-rates และ logic ระบบคิดค่าแรงปัจจุบันไว้ทั้งหมด

สำรองไฟล์ก่อนแก้ 20 ไฟล์ไว้ใน `.backups/retired-daily-scan-20260905/` ตาม relative path เดิม (ลบ 16 ไฟล์ ปรับ 4 ไฟล์)
URL work-types เก่าจะเปลี่ยนทางไป settings/type ตาม fallback เดิม ส่วน daily-scan และ API ที่ถอดจะไม่พร้อมใช้งานหลัง deploy

## ไม่ลบ

ฐานข้อมูล ตาราง ข้อมูล migration และ generated types ไม่เปลี่ยนแปลง
ไม่แตะสินค้า บาร์โค้ด FG/WIP เครื่องชั่ง ป้ายแยม ของเสีย หรือการตั้งค่าบาร์โค้ดพาเลท
เก็บ `sunmiDirectPrintClient.js` และ Android bridge ส่วนกลางไว้ แม้ยังมีชื่อ DailyWork
เก็บ `dailyWorkOffline.js` และ `dailyWorkSync.js` ไว้ และไม่ล้าง IndexedDB บนเครื่องผู้ใช้

## ข้อจำกัดก่อนนำขึ้นระบบจริง

การตรวจฐานข้อมูลก่อนหน้านี้พบ `production_daily_work_logs` จำนวน 0 รายการ แต่ไม่ได้ยืนยันว่าอุปกรณ์ทุกเครื่องไม่มีคิวออฟไลน์
ก่อน deploy ให้ตรวจเครื่องหน้างานว่าไม่มี daily-scan ค้างส่ง/ค้างพิมพ์ เพราะ API ที่ถอดจะไม่รับการ sync หลัง deploy
ถ้ามีคิวค้าง ให้เลื่อนการ deploy และใช้รุ่นเดิมจัดการรายการเหล่านั้นก่อน ห้ามล้างคิวทิ้ง

## ย้อนกลับ

เทียบไฟล์ปลายทางกับสำเนาก่อน แล้วคัดลอกเฉพาะ 20 ไฟล์จากโฟลเดอร์สำรองกลับตาม path เดิม
อย่าเขียนทับงานใหม่ที่เกิดหลังการถอดโดยไม่ตรวจความต่าง จากนั้นทดสอบและ build ใหม่
โฟลเดอร์สำรองอยู่เฉพาะเครื่องและถูก Git ignore ตามการตั้งค่าเดิม

## การตรวจสอบ

- ESLint สี่ไฟล์ที่แก้ผ่าน
- npm run build ผ่าน (exit code 0); build manifest ไม่มี endpoint ที่ถอด และยังมี piece-rate-scan, production-piece-rate-settings, weight-scale, fg-wip และ weight-scale/waste
- เทียบ SHA-256 ของไฟล์ใน src และ supabase ก่อน/หลัง 877 ไฟล์: ลบ 16 ไฟล์ ปรับ 4 ไฟล์ตามขอบเขตเท่านั้น ไม่มีไฟล์อื่นเปลี่ยน
- เทียบเนื้อหาสี่ไฟล์ที่ปรับกับการแก้ที่คาดไว้: ตรงกันทั้งหมด และตรวจแท็บตั้งค่าอื่นยังอยู่
- ชุดทดสอบ attendance-menu-cards, weight-scale-input-source, piece-rate-waste-category-ui และ piece-rate-report-metrics ผ่าน 15 ข้อ
- ไม่ได้ deploy หรือทดสอบเครื่องชั่ง/เครื่องพิมพ์จริง
