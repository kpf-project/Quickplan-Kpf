# คู่มือเชื่อม LINE OA สำหรับงานอนุมัติ

วัตถุประสงค์
- ส่งแจ้งเตือนเข้ากลุ่ม LINE และให้กดอนุมัติ/ปฏิเสธผ่านลิงก์
- ใช้ LINE Official Account (OA) + Messaging API

สิ่งที่ต้องมี
- สามารถสร้าง LINE Official Account (OA) ได้
- เข้าถึง LINE Developers Console ได้
- สามารถเชิญบอทเข้า LINE Group ได้

ขั้นตอนที่ 1: สร้าง LINE Official Account (OA)
1) เข้า LINE Official Account Manager แล้วสร้าง OA ใหม่
2) ตั้งชื่อ OA และปรับค่าพื้นฐานให้ตรงกับองค์กร

ขั้นตอนที่ 2: สร้าง Provider + Messaging API Channel
1) เข้า LINE Developers Console
2) สร้าง Provider (ถ้ายังไม่มี)
3) สร้าง Messaging API Channel ใน Provider นั้น
4) ในหน้า Channel settings ให้เปิด
   - "Allow bot to join groups/rooms" (ต้องเป็น ON)
5) บันทึกการเปลี่ยนแปลง

ขั้นตอนที่ 3: เก็บค่า Token และ ID ที่จำเป็น
จากหน้า Messaging API channel settings:
- Channel secret
- Channel access token (แบบ long-lived)

จาก LINE group:
- Group ID (ต้องดึงจาก webhook event payload; ดูขั้นตอนที่ 4)

ขั้นตอนที่ 4: ดึง Group ID
1) ตั้ง webhook URL ชั่วคราวใน Messaging API channel
2) เชิญบอทเข้า group (ต้องให้แอดมินกลุ่มเชิญ)
3) ส่งข้อความใดก็ได้ใน group
4) ดู webhook event payload แล้วหา:
   - source.type = "group"
   - source.groupId = "<GROUP_ID>"
5) เก็บค่า groupId ไว้ใช้งาน

ขั้นตอนที่ 5: ตั้งค่า Backend Webhook
1) สร้าง webhook endpoint ที่ปลอดภัยในระบบ
2) ตรวจสอบ signature ของ LINE ด้วย Channel secret
3) parse event และตรวจสอบว่า groupId ถูกต้อง

ค่า Environment ที่ต้องใช้ (ตัวอย่าง)
- LINE_CHANNEL_SECRET=...
- LINE_CHANNEL_ACCESS_TOKEN=...
- LINE_APPROVAL_GROUP_ID=...
- LINE_APPROVAL_WEBHOOK_SECRET=... (ถ้ามีการเซ็นของระบบเอง)
- APP_BASE_URL=... (ใช้สร้างลิงก์ approve/reject)

ขั้นตอนที่ 6: ส่งคำขออนุมัติเข้ากลุ่ม
ข้อมูลที่ควรส่งในข้อความ:
- รหัสสินค้า + ชื่อสินค้า
- เวอร์ชัน
- ผู้แก้ไข (username)
- สรุป diff
- ลิงก์ Approve/Reject

รูปแบบลิงก์ (ตัวอย่าง)
- Approve: {APP_BASE_URL}/production-line/bom/approve?versionId=...&token=...
- Reject: {APP_BASE_URL}/production-line/bom/reject?versionId=...&token=...

ข้อควรระวังด้านความปลอดภัย
- ห้ามใส่ user ID แบบดิบใน URL
- ใช้ signed token ที่มีวันหมดอายุ
- บันทึก log การ approve/reject พร้อมผู้อนุมัติและเวลา

เช็กลิสต์ทดสอบ
- บอทเข้ากลุ่มได้
- ส่งข้อความเข้ากลุ่มได้
- ลิงก์ Approve/Reject ใช้งานได้และเปลี่ยนสถานะจริง
- ตรวจสอบ webhook signature ผ่าน

หมายเหตุ
- หาก LINE มีการเปลี่ยนนโยบาย ให้ตรวจสอบใน Developer Console อีกครั้ง
- เก็บ Channel secret และ access token ไว้ใน env เท่านั้น (ห้าม commit)
