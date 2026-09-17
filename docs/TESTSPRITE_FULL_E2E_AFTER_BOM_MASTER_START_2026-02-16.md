# TestSprite UAT แบบเต็ม: เริ่มหลังผูก BOM เสร็จ (เริ่มจากวางแผนใหญ่)

วันที่เอกสาร: 2026-02-16  
สถานะ: Active  
จุดเริ่มการเทส: หลังจาก BOM ของ SKU ที่จะผลิตอยู่สถานะ `approved` แล้ว

## 1) วัตถุประสงค์
- เทสครบทั้งเส้นงานจริงตั้งแต่ `Master Plan` จนถึง `Requisition/Control Tower/Trace`
- ยืนยันสิทธิ์และ owner scope ตามแผนก
- ยืนยัน logic คำนวณวัตถุดิบว่าใช้ทั้ง `Stock` และ `Open PO ETA` ตามระบบจริง
- เตรียมชุดขั้นตอนให้ TestSprite ใช้สร้าง/รัน test cases ได้ทันที

## 2) ขอบเขตรอบนี้ (สำคัญ)
- หน้า owner วัตถุดิบใช้โหมดง่ายแล้ว: `1 SKU = 1 Owner Department` (ไม่มี Trade Override)
- การเลือกรหัสซื้อขายสำหรับเบิก ให้ถือเป็นงานฝั่งใบเบิก/ERP ไม่ใช่หน้า owner
- เอกสารส่งเข้า ERP ใช้ `เลขใบเบิก (Requisition No)` ไม่ใช่ `Plan No`

## 3) บทบาทที่ต้องใช้เทส
- `UAT_PLN_MGR`: วางแผนหลัก / publish / มองภาพรวม
- `UAT_QA_DEPT_A`: QA editor แผนก A
- `UAT_QA_DEPT_B`: QA editor แผนก B
- `UAT_VIEWER`: ดูอย่างเดียว
- `UAT_EXCEPTION_MGR`: ดู control tower / approve exception

## 4) หน้าที่ต้องใช้
- `/production-line/bom`
- `/production-line/settings/department-products`
- `/production-line/settings/material-owners`
- `/production-line/planning/master`
- `/production-line/planning/plan`
- `/production-line/planning/inbox`
- `/production-line/planning/control-tower`
- `/production-line/planning/trace`
- `/production-line/planning/report`
- `/production-line/planning/expired`
- `/raw-material-requisitions/requisition`

## 5) สิ่งที่ต้องเตรียมก่อนเริ่ม
- มี BOM ที่ `approved` สำหรับ FG/WIP ที่จะเทส
- มี FG อย่างน้อย 1 SKU, WIP อย่างน้อย 1 SKU, RAW อย่างน้อย 3 SKU
- ผูก `department-products` ให้ QA A/B มี SKU ใน scope คนละชุด
- ผูก `material-owners` ครบทุกวัตถุดิบสำคัญที่อยู่ใน BOM
- มี stock จริงใน ERP ทั้งเคส “พอ” และ “ไม่พอ”
- มี open PO ETA อย่างน้อย 1 SKU เพื่อเทส ETA
- เตรียมเลขแผนตัวอย่าง เช่น `MP-2026-W08-001`

## 6) แผนเทสแบบ Phase (ทำตามลำดับ)

## Phase A: ตั้งค่า Scope ก่อนวางแผน

### TC-A1 ตั้ง owner สินค้า/แผนก
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เข้า `/production-line/settings/department-products`
2. ผูก SKU ให้แผนก A และ B
3. ผูกผู้ใช้ QA A/B กับแผนกของตนใน role `editor`
ผลที่คาดหวัง:
- QA A/B เห็นและแก้ได้เฉพาะ scope ตัวเอง

### TC-A2 ตั้ง owner วัตถุดิบ (Default Owner ต่อ SKU)
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เข้า `/production-line/settings/material-owners`
2. กำหนด owner วัตถุดิบให้ครบ
3. ลองโอน owner SKU เดียวจาก A ไป B
ผลที่คาดหวัง:
- SKU เดียวมี owner ได้เพียง 1 แผนก
- โอนแล้วผลเปลี่ยนทันที

## Phase B: วางแผนใหญ่ (Master Plan)

### TC-B1 สร้างแผนใหญ่
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เข้า `/production-line/planning/master`
2. ใส่ `Plan No` ที่ format ถูก
3. เพิ่มรายการ FG หลาย SKU
4. ใส่ปริมาณรายวัน/รายช่วง
ผลที่คาดหวัง:
- บันทึกแผนได้ และแถวแสดงในหน้า master

### TC-B2 Publish แผนใหญ่
ผู้ทดสอบ: `UAT_PLN_MGR`
1. กด `Publish Master Plan`
ผลที่คาดหวัง:
- publish สำเร็จ
- plan ถูกส่งต่อไป flow workbench/inbox

## Phase C: QA ทำแผนย่อยจาก Plan No

### TC-C1 QA รับงานจาก inbox
ผู้ทดสอบ: `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`
1. เข้า `/production-line/planning/inbox`
2. เลือก `Plan No` เดียวกัน
3. ตรวจว่าแถวนอกแผนกเป็น read-only
4. ยืนยัน/confirm เฉพาะแถวที่อยู่ใน scope ตัวเอง
ผลที่คาดหวัง:
- A แก้ได้เฉพาะของ A
- B แก้ได้เฉพาะของ B
- ข้ามแผนกแก้ไม่ได้

## Phase D: คำนวณวัตถุดิบ (สำคัญ)

### TC-D1 กรณี stock พอ
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. เรียกคำนวณผ่าน UI หรือ `POST /api/production-planning/calculate`
2. ใช้แผนที่ stock พอ
ผลที่คาดหวัง:
- material status ส่วนใหญ่เป็น `available`
- plan summary เป็น `ready`

### TC-D2 กรณี stock ไม่พอ แต่มี Open PO
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. ใช้แผนที่ทำให้วัตถุดิบบางตัวขาด
2. SKU ที่ขาดต้องมี open PO ETA
3. คำนวณใหม่
ผลที่คาดหวัง:
- มี `earliestMaterialEta`
- status ขยับเป็น `partial/backorder` ตามปริมาณขาด

### TC-D3 กรณี stock ไม่พอ และไม่มี Open PO
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. ใช้แผนที่ขาด และไม่มี PO
2. คำนวณใหม่
ผลที่คาดหวัง:
- ระบบ fallback ตาม lead time/min-max
- ถ้าไม่พอจริงอาจเป็น `blocked`

### TC-D4 บังคับ masterPlanNo และ scope
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. เรียก calculate โดยไม่ส่ง `masterPlanNo`
2. ส่ง `masterPlanNo` format ผิด
3. ส่งแผนที่มี SKU นอก scope
ผลที่คาดหวัง:
- ได้ 400 สำหรับ plan no ไม่ถูก
- ได้ 403 สำหรับ department scope violation

## Phase E: WIP Sufficiency และ Draft WIP

### TC-E1 ตรวจ WIP sufficiency
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. เรียก `GET /api/production-planning/wip-sufficiency?masterPlanNo=...`
ผลที่คาดหวัง:
- เห็นเฉพาะ WIP ที่อยู่ใน scope ผู้ใช้

### TC-E2 สร้าง draft WIP
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. เรียก `POST /api/production-planning/wip-plan/draft`
2. ระบุ `masterPlanNo` และ `departmentId`
ผลที่คาดหวัง:
- สร้าง draft เฉพาะแผนกที่มีสิทธิ์

## Phase F: Export ใบเบิกและตรวจเอกสาร

### TC-F1 Export requisition
ผู้ทดสอบ: `UAT_QA_DEPT_A`
1. เรียก `POST /api/production-planning/requisition/export`
2. ลอง `weekly` และ `daily`
ผลที่คาดหวัง:
- export ได้เฉพาะแผนกของตน
- เอกสารถูกแยกวัสดุตาม material owner

### TC-F2 ตรวจหน้ารายการใบเบิก
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เปิด `/raw-material-requisitions/requisition`
2. ตรวจรายการที่ export แล้ว
ผลที่คาดหวัง:
- เอกสารตามรอบที่ส่งออกตรงกับแผน

## Phase G: Control Tower / ETA Feedback / Replan

### TC-G1 ดูสถานะใน control tower
ผู้ทดสอบ: `UAT_EXCEPTION_MGR`
1. เข้า `/production-line/planning/control-tower`
2. filter ตามช่วงวันที่/แผนก
ผลที่คาดหวัง:
- เห็น delayed/short/backorder ชัดเจน

### TC-G2 ให้ feedback ETA แล้ว replan
ผู้ทดสอบ: `UAT_EXCEPTION_MGR`
1. ส่ง ETA feedback
2. สั่ง replan
ผลที่คาดหวัง:
- แผนได้รับการปรับตาม ETA
- สถานะและเหตุผลเปลี่ยนตามข้อมูลใหม่

## Phase H: Trace + Report + Expired

### TC-H1 Trace ย้อนรอย
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เข้า `/production-line/planning/trace`
2. ค้นหา `Plan No`
ผลที่คาดหวัง:
- เห็นความเชื่อมโยง main/sub/material impact

### TC-H2 Report และ Expired
ผู้ทดสอบ: `UAT_PLN_MGR`, `UAT_VIEWER`
1. เข้า `/production-line/planning/report`
2. เข้า `/production-line/planning/expired`
3. ลอง filter ตาม plan no/แผนก/ช่วงวัน
ผลที่คาดหวัง:
- viewer ดูข้อมูลได้
- viewer แก้ไขไม่ได้

## 7) สรุป logic คำนวณ Stock/PO (สำหรับคนเทส)
- ระบบคำนวณวัตถุดิบจาก BOM explosion ก่อน
- จากนั้นดึง:
1. Stock summary
2. Min/Max + Lead Time
3. Open PO ETA
- แล้วหัก issued qty ผ่าน stock deduction ก่อนตัดสินว่าพอหรือไม่
- ถ้าขาดจะพยายามหา ETA จาก PO ก่อน ถ้าไม่มีจึง fallback lead time

## 8) ชุด Negative Cases ที่ต้องมี
- QA A แก้แผนของแผนก B -> ต้อง 403
- Viewer พยายาม confirm/แก้ไข -> ต้องถูก block
- calculate ไม่มี `masterPlanNo` -> 400
- calculate `masterPlanNo` ไม่ตรงรายการใน payload -> 400
- export requisition ข้ามแผนก -> 403

## 9) หลักฐานที่ต้องแนบตอนจบ
- screenshot ทุก phase (ก่อน/หลัง action)
- response JSON ของ API สำคัญอย่างน้อย:
1. calculate
2. wip-sufficiency
3. wip-plan/draft
4. requisition/export
- หลักฐาน role-based pass/fail (A, B, Viewer, Manager)
- สรุป defect list (ถ้ามี) พร้อมขั้นตอน reproduce

## 10) Definition of Done รอบ UAT นี้
- ผ่านครบ Phase A ถึง H
- ไม่พบช่องโหว่ owner scope/masterPlanNo enforcement
- ค่าคำนวณสอดคล้องกับ stock + open PO ตามข้อมูลทดสอบ
- เอกสารพร้อมส่งให้ทีม ERP/UAT sign-off
