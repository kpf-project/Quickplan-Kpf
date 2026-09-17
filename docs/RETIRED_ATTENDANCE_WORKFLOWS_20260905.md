# การนำงาน 400g และสแกนพาเลทออก (5 กันยายน 2569)

## ขอบเขต

นำออกเฉพาะหน้าบันทึก รายงาน API และ service ที่ใช้เฉพาะสองงานนี้:

- `/production-line/attendance/snack-yield-scan`
- `/production-line/attendance/report/snack-yield`
- `/production-line/attendance/pallet-scan`
- `/production-line/attendance/report/pallet-scan`
- `/api/attendance/snack-yield` และ route ย่อย
- `/api/attendance/pallet-scan`

ลบไฟล์เฉพาะงาน 18 ไฟล์ และปรับเพียงสามจุดในไฟล์ที่ยังใช้งาน:

- `AttendanceReportHubPageClient.js`: เอาการ์ดรายงานสองงานออก
- `PieceRateReportPageClient.js`: เอาเฉพาะลิงก์รายงานพาเลทออก ไม่เปลี่ยน logic รายงานคิดค่าแรง
- `authorizeService.js`: เอา alias ของสี่หน้าเก่าออก ไม่เปลี่ยนสิทธิ์หน้าอื่น

URL เก่าจะไม่มีหน้า/API ให้ใช้งานหลังนำรุ่นนี้ขึ้นระบบ ไม่ได้ตั้ง redirect ไปบันทึกงานประเภทอื่น

## ส่วนที่เก็บไว้

ไม่ลบหรือแก้ฐานข้อมูล ตาราง ข้อมูลเดิม migration ระบบสินค้า บาร์โค้ดสินค้า บาร์โค้ดจำนวนพาเลท การตั้งค่าค่าแรง และส่วนกลาง
ไม่เปลี่ยน logic ของ FG/WIP เครื่องชั่งผลิตภัณฑ์ บันทึกเนื้อขนมป้ายแยม ชั่งของเสีย หรือการออกบาร์โค้ด
ไฟล์สำเนาเก่า `PieceRateReportPageClient_recovered.js` เก็บไว้ตามเดิม; ตรวจไม่พบตัวเรียกใช้งานใน `src`

## สำรองและย้อนกลับ

สำรองไฟล์ทั้ง 21 ไฟล์ก่อนเปลี่ยนไว้ใน `.backups/retired-attendance-20260905/` โดยรักษาโครงสร้าง path เดิม
โฟลเดอร์นี้ถูก ignore โดย Git อยู่แล้ว และเป็นสำเนาเฉพาะเครื่อง ไม่ใช่สำรองฐานข้อมูล

หากต้องย้อนกลับ ให้หยุดการเผยแพร่ ตรวจว่าไฟล์ปลายทางสามไฟล์ที่ปรับไม่มีงานใหม่ซ้อน แล้วคัดลอกไฟล์ในสำเนากลับตาม relative path เดิม จากนั้นทดสอบและ build ใหม่
อย่าคัดลอกทับงานที่แก้ภายหลังโดยไม่เทียบความต่างก่อน

## การตรวจสอบ

- เทียบ SHA-256 ของไฟล์ใน `src` และ `supabase` ก่อน/หลัง 895 ไฟล์: เปลี่ยนเฉพาะ 21 ไฟล์ในขอบเขต ไม่มีไฟล์อื่นเปลี่ยน
- เทียบเนื้อหาสามไฟล์ที่ปรับกับสำเนา: ต่างเฉพาะการเอาเมนูและ alias หน้าเก่าออก
- ตรวจไม่พบ route/import ของสองงานในโค้ดที่ใช้งาน เหลือเพียงลิงก์ในไฟล์สำเนา `_recovered` ที่ไม่ได้ถูกเรียกใช้
- ESLint สามไฟล์ที่ปรับผ่าน
- `npm run build` ผ่าน (exit code 0); ตรวจ build manifest ว่าหน้า/API สองงานถูกนำออก และ FG/WIP เครื่องชั่ง ป้ายแยม และรายงานคิดค่าแรงยังอยู่
- ชุดทดสอบด้านล่างผ่าน 23 ข้อ:

```powershell
npm run test -- tests/attendance-menu-cards.test.mjs tests/weight-scale-input-source.test.mjs tests/weight-scale-live-receiving.test.mjs tests/piece-rate-waste-category-ui.test.mjs
```

ผลตรวจโค้ดและ unit test ไม่ใช่การทดสอบเครื่องชั่ง/เครื่องพิมพ์จริงหน้างาน และการแก้นี้ไม่ได้เผยแพร่ขึ้นระบบจริงอัตโนมัติ
