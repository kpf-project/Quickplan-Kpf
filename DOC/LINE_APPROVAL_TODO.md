# สรุปสถานะงาน: LINE Approval + BOM Workflow

เอกสารนี้สรุปว่า “ทำอะไรไปแล้ว” และ “เหลืออะไร” เพื่อให้คนที่มาทำต่อเข้าใจทันที

## ทำเสร็จแล้ว

### 1) ตั้งค่า LINE OA และ Messaging API
- สร้าง LINE OA แล้ว
- เปิด Messaging API แล้ว
- เปิด Allow bot to join groups/rooms แล้ว
- เปิด Use webhook แล้ว (ชั่วคราวเพื่อดึง Group ID)
- เชิญบอทเข้า group แล้ว
- ดึง Group ID ได้แล้ว

### 2) ทดสอบส่งข้อความเข้า Group
- ทดสอบด้วย `Invoke-WebRequest` แล้วได้ `StatusCode 200`
- ข้อความเข้า group สำเร็จ

### 3) ค่า env ที่ได้และใส่แล้ว
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_APPROVAL_GROUP_ID`

## เหลือที่ต้องทำ (งานระบบหลัก)

### A) สร้าง API ส่งแจ้งเตือนเข้า Line
เป้าหมาย: เมื่อมีการ “ส่งขออนุมัติสูตร” ให้ส่งข้อความเข้า group พร้อมรายละเอียด

ต้องมี:
- Endpoint ในระบบสำหรับส่ง message (เช่น `/api/line/notify`)
- ส่งข้อมูลที่ต้องมีในข้อความ:
  - รหัสสินค้า + ชื่อสินค้า
  - เวอร์ชันสูตร
  - ผู้แก้ไข
  - สรุป diff
  - ลิงก์ approve / reject

### B) สร้าง Flow อนุมัติ/ปฏิเสธ
เป้าหมาย: กดจากลิงก์ใน LINE แล้วเปลี่ยนสถานะได้จริง

ต้องมี:
- หน้า/endpoint สำหรับ Approve
- หน้า/endpoint สำหรับ Reject
- ตรวจสอบ token (signed + มีวันหมดอายุ)
- บันทึก log: ผู้อนุมัติ, เวลา, เหตุผล (ถ้ามี)

### C) ปรับโมเดลสถานะ BOM
เป้าหมาย: ให้สอดคล้องกับ workflow

แนวทาง:
- Draft → Pending Review → Approved → Rejected
- ถ้าไม่เคยตั้งสูตร: ต้องสร้างสูตรก่อนส่งอนุมัติได้
- ถ้าแก้สูตร: เปลี่ยนเป็น Pending Review ทุกครั้ง

ตารางที่เกี่ยวข้อง:
- `production_boms`
- `production_bom_versions`
- อาจเพิ่มตารางใหม่สำหรับ approvals/audit (เช่น `production_bom_approvals`)

### D) สิทธิ์ (Permissions)
เป้าหมาย: แยกคน “ส่งอนุมัติ” กับ “อนุมัติ/ปฏิเสธ”

แนะนำ:
- permission `production-line-bom-request-approval`
- permission `production-line-bom-approve`

### E) UI ที่ต้องเพิ่ม
เป้าหมาย: ให้ผู้ใช้ใช้งานได้ครบ flow

ต้องมี:
- ปุ่ม “ส่งขออนุมัติ” ในหน้า BOM (เฉพาะผู้มีสิทธิ์)
- แสดงสถานะ Pending/Approved/Rejected
- แสดงผู้อนุมัติ + เวลาใน UI
- ถ้า Reject ให้แสดงเหตุผล

## เหลือที่ต้องทำ (งานทางเทคนิคเสริม)

### 1) Webhook จริง (ถ้าต้องใช้ approve ใน LINE)
ถ้าจะให้กด Approve/Reject จากในไลน์แบบ Interactive:
- ต้องทำ LINE webhook จริง
- ใช้ Messaging API + Bot
- เพิ่ม verify signature ด้วย `LINE_CHANNEL_SECRET`

### 2) Security
- ทุกลิงก์อนุมัติ/ปฏิเสธต้องมี signed token
- token ต้องมี expiration
- log ทุก action ใน audit

## เช็กลิสต์ก่อนปิดงาน
- [ ] ส่งข้อความเข้า LINE ได้จากระบบจริง (ไม่ใช่ curl)
- [ ] Approve เปลี่ยนสถานะ BOM เป็น Approved
- [ ] Reject เปลี่ยนสถานะ BOM เป็น Rejected พร้อมเหตุผล
- [ ] การแก้ไขสูตรทุกครั้งเปลี่ยนสถานะกลับเป็น Pending Review
- [ ] ผู้ไม่มีสิทธิ์ไม่สามารถ Approve/Reject ได้
- [ ] UI แสดงสถานะและประวัติอนุมัติถูกต้อง
