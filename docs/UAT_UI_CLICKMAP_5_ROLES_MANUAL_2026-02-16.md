# คู่มือกดจริงหน้า UI (5 Roles) แบบภาษาคน

วันที่: 2026-02-16  
ใช้คู่มือนี้เมื่อต้องเทสเองทีละคนแบบไม่งงว่า “ต้องกดตรงไหน”

---

## 1) แผนที่เมนูหลัก (เมนู -> URL)

| เมนูใน Sidebar | URL |
|---|---|
| ไลน์ผลิต > บันทึกแผนการผลิต | `/production-line/planning/master` |
| ไลน์ผลิต > ศูนย์ควบคุมวัตถุดิบ | `/production-line/planning/control-tower` |
| ไลน์ผลิต > ตั้งค่า | `/production-line/settings/department-products` |
| คลังวัตถุดิบ > ใบเบิกวัตถุดิบ | `/raw-material-requisitions/requisition` |
| ตั้งค่าระบบ (เฉพาะ Admin) | `/admin/settings` |

หมายเหตุ: หน้า Planning มีแท็บด้านบนให้กดต่อในหน้าเดียว
- `แผนหลัก` -> `/production-line/planning/master`
- `งานแผนก` -> `/production-line/planning/plan`
- `อินบ็อกซ์` -> `/production-line/planning/inbox`
- `รายงาน` -> `/production-line/planning/report`
- `หมดอายุ` -> `/production-line/planning/expired`
- `ศูนย์วัตถุดิบ` -> `/production-line/planning/control-tower`
- `ติดตามร่องรอย` -> `/production-line/planning/trace`

---

## 2) ก่อนเริ่มเทส (ทำครั้งเดียวด้วย Admin)

### 2.1 ตั้งผู้ใช้/บทบาท
หน้า: `ตั้งค่าระบบ` -> `/admin/settings`  
เมนู: `ผู้ใช้งาน`

1. เข้าแท็บย่อย `บทบาทและสิทธิ์`
2. เช็ก role UAT 5 ตัวว่ามีครบ
3. เข้าแท็บย่อย `สร้างผู้ใช้ใหม่`
4. ปุ่มที่ใช้:
- `สร้างผู้ใช้งาน`
- (ถ้าต้องเพิ่ม role/แก้ role ใช้ `บันทึกบทบาท` หรือ `บันทึกการแก้ไข`)

### 2.2 ผูกแผนก + สิทธิ์ editor/viewer
หน้า: `ไลน์ผลิต > ตั้งค่า` -> `/production-line/settings/department-products`  
แท็บบนหน้า: `หมวดหมู่สินค้าแผนก`

ปุ่มสำคัญที่ใช้:
- `เพิ่ม` (สร้างแผนก)
- `แก้ไข`, `ปิดใช้งาน`
- `ตั้ง Owner` (กำหนด SKU owner)
- `เพิ่มสินค้า`
- เลือก role ผู้ใช้เป็น `แก้ไขได้` หรือ `ดูอย่างเดียว`
- `เพิ่มผู้ใช้`

### 2.3 ผูก owner วัตถุดิบ (RAW/WIP)
หน้า: `/production-line/settings/material-owners`  
แท็บบนหน้า: `เจ้าของวัตถุดิบ`

ปุ่มสำคัญที่ใช้:
- `กำหนด Owner`
- `ลบ`

---

## 3) Click-by-Role (กดตามนี้ได้เลย)

## 3.1 UAT_PLN_MGR (วางแผนหลัก)

1. เมนู: `ไลน์ผลิต > บันทึกแผนการผลิต`  
URL: `/production-line/planning/master`
2. ตั้งค่า `วันที่เริ่ม`, `วันที่สิ้นสุด`, `Plan No`
3. กดปุ่ม `เลือกรายการสินค้า`
4. เลือก SKU ที่ต้องการ แล้วกลับมาหน้าหลัก
5. กดปุ่ม `เผยแพร่แผนหลัก`
6. เช็กว่ามีข้อความแนวนี้ขึ้น: `Master Plan Published` / `Published`

หมายเหตุสำคัญตามขอบเขต:
- หน้า `แผนหลัก` ใช้สำหรับสร้างแผน + publish
- การ `คำนวณวัตถุดิบ` ให้ทำในหน้า `งานแผนก` / `อินบ็อกซ์` เท่านั้น

ผลที่คาดหวัง:
- สร้าง draft ได้
- publish ได้
- แผนพร้อมส่งให้ QA ทำงานใน `งานแผนก` / `อินบ็อกซ์`

---

## 3.2 UAT_QA_DEPT_A (ทำแผนเฉพาะแผนก A)

1. เปิดหน้า `/production-line/planning/plan` (แท็บ `งานแผนก`)
2. กดสโคป `งานแผนกฉัน (Editable)`
3. เลือก Plan จากกล่อง `อินบ็อกซ์แผนก`
4. กดปุ่มหลักด้านขวาบน:
- ในบางจอจะขึ้น `Confirm Sub Plan`
- หรือใช้ flow คำนวณเดิม `คำนวณวัตถุดิบ`
5. ตรวจผลสถานะในตาราง (`ready/partial/backorder/blocked`)
6. ไปหน้าใบเบิก: `/raw-material-requisitions/requisition` เพื่อตรวจรายการ export (ถ้ารอบนั้น export แล้ว)

ผลที่คาดหวัง:
- แก้ได้เฉพาะ scope แผนก A
- ถ้าพยายามแก้ข้ามแผนก ต้องโดน block (403 หรือ read-only)

---

## 3.3 UAT_QA_DEPT_B (ทำแผนเฉพาะแผนก B)

ทำเหมือน QA A แต่เป็นข้อมูลแผนก B

เส้นทางหลัก:
- `/production-line/planning/plan`
- `/production-line/planning/inbox`
- `/raw-material-requisitions/requisition`

ผลที่คาดหวัง:
- แก้ได้เฉพาะ B
- ข้ามไปแก้ A ต้องถูก block

---

## 3.4 UAT_VIEWER (ดูอย่างเดียว)

หน้าเข้าใช้งาน:
- `/production-line/planning/master`
- `/production-line/planning/plan`
- `/production-line/planning/inbox`
- `/production-line/planning/control-tower`
- `/production-line/planning/trace`
- `/raw-material-requisitions/requisition`

สิ่งที่ต้องลอง:
1. เข้าแต่ละหน้าให้ได้
2. ลองกดปุ่มที่เป็นงานเขียนข้อมูล เช่น `คำนวณวัตถุดิบ`, `เผยแพร่แผนหลัก`, แก้ไขจำนวน

ผลที่คาดหวัง:
- ดูได้
- แต่ action เขียนข้อมูลต้องทำไม่ได้ (forbidden/read-only)

---

## 3.5 UAT_EXCEPTION_MGR (Control Tower / ETA / Replan)

1. เมนู: `ไลน์ผลิต > ศูนย์ควบคุมวัตถุดิบ`  
URL: `/production-line/planning/control-tower`
2. ตั้ง filter แล้วกด `ใช้ตัวกรอง`
3. ในกล่อง action ด้านล่าง:
- กรอก `SKU วัตถุดิบ`
- กรอก `ETA ใหม่`
- กด `บันทึก ETA และ Replan ทันที`
4. ถ้าจะเข้าคิวงานแทน immediate:
- กด `สั่ง Replan ผ่าน Queue`
5. ไปหน้า trace เพื่อตรวจผล:
- `/production-line/planning/trace`

ผลที่คาดหวัง:
- action สำเร็จ
- เห็นผลกระทบใน trace/control tower

---

## 4) หน้าใบเบิกที่ต้องเช็กหลังเทส

หน้า: `/raw-material-requisitions/requisition`  
เมนู: `คลังวัตถุดิบ > ใบเบิกวัตถุดิบ`

ปุ่มหลัก:
- `ค้นหา`
- `ก่อนหน้า` / `ถัดไป`

ต้องเช็ก:
1. มีเอกสารใบเบิกถูกสร้าง
2. แยกตาม owner ถูกต้อง
3. ใช้เลขใบเบิก (ไม่ใช้ Plan No เป็นเลขเอกสารส่ง ERP)

---

## 5) กรณีงงตารางโดนตัด/มองไม่ครบ (สำคัญ)

อาการที่เจอบ่อย:
1. หน้า `บันทึกแผนการผลิต` ตารางกว้างมาก คอลัมน์ขวาหาย
2. บางหน้าตารางเหมือนถูกบีบ ไม่เต็มความกว้าง

วิธีใช้งานให้เห็นครบก่อน (workaround ตอนเทส):
1. เปิดจอเต็ม (`F11`) และใช้ zoom 80%-90%
2. เอาเมาส์ไปใน “กรอบตาราง” แล้วเลื่อนแนวนอน (Shift + ล้อเมาส์ หรือ trackpad 2 นิ้วซ้าย/ขวา)
3. ถ้าจอกว้างไม่ถึง `xl` บางคอลัมน์จะถูกซ่อนตาม responsive โดยตั้งใจ (เช่นคอลัมน์ท้ายบางตัว) ให้ลองจอใหญ่ขึ้น
4. หน้าใบเบิกให้เลื่อนในกรอบตารางเอง ไม่ใช่เลื่อนทั้งหน้า

หมายเหตุเทคนิค (เพื่อไม่งง):
- ตารางใน Planning ใช้ `table-fixed` + คอลัมน์คงที่หลายคอลัมน์
- ตารางใบเบิกเป็นตารางใหญ่และมี scroll behavior แยกของมันเอง

---

## 6) Checklist สั้นๆ ว่ารอบเทสผ่านไหม

1. `UAT_PLN_MGR` สร้าง + Publish Master ได้
2. `UAT_QA_DEPT_A/B` ทำงานได้เฉพาะแผนกตัวเอง
3. `UAT_VIEWER` ดูได้แต่แก้ไม่ได้
4. `UAT_EXCEPTION_MGR` ทำ ETA/Replan ได้
5. หน้า `/raw-material-requisitions/requisition` มีผลใบเบิกถูกต้อง

ถ้าต้องส่งผลให้ทีม ให้สรุป 4 หัวข้อนี้เสมอ:
1. Overall Verdict
2. Per-Page Verdict
3. Per-Role Verdict
4. Defect Summary
