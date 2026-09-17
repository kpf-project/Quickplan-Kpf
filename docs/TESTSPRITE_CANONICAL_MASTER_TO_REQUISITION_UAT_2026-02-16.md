# TestSprite Canonical UAT: Master Plan -> Sub Plan -> Requisition

วันที่เอกสาร: 2026-02-16  
สถานะ: **Canonical / ใช้ไฟล์นี้เป็นหลัก**

## 1) ใช้ไฟล์นี้ทำอะไร
- ใช้สั่ง TestSprite ให้เทสครบตั้งแต่ “วางแผนใหญ่” จน “ออกใบเบิกแยกตามส่วน”
- ระบุชัดว่าเริ่มจากไหน จบที่ไหน ผลลัพธ์ที่ต้องได้คืออะไร
- ระบุเกณฑ์ตรวจว่า “ข้อมูลถูกต้องไหม” ตอนเทส

## 2) ขอบเขตการเทส (Start -> End)
- Start: หลัง BOM ที่เกี่ยวข้องเป็น `approved` แล้ว
- End: Export ใบเบิกสำเร็จ และตรวจความถูกต้องของปริมาณ/owner/scope/เลขเอกสารครบ

## 3) ผู้ใช้ทดสอบ
- `UAT_PLN_MGR`
- `UAT_QA_DEPT_A`
- `UAT_QA_DEPT_B`
- `UAT_VIEWER`
- `UAT_EXCEPTION_MGR`

## 4) หน้าที่ต้องเข้า
- `/production-line/planning/master`
- `/production-line/planning/plan`
- `/production-line/planning/inbox`
- `/production-line/planning/control-tower`
- `/production-line/planning/trace`
- `/raw-material-requisitions/requisition`

หน้าตั้งค่าก่อนเทส:
- `/production-line/settings/department-products`
- `/production-line/settings/material-owners`

## 5) Preconditions (ต้องพร้อมก่อนเริ่ม)
- BOM ของ FG/WIP/RAW ที่ใช้เทสอยู่สถานะ `approved`
- ผูก `department-products` ครบ (QA A/B เป็น `editor`, viewer เป็น `viewer`)
- ผูก `material-owners` ครบทุก RAW สำคัญ
- มีข้อมูล ERP ครบ: Stock, Open PO + ETA, Min/Max + Lead time
- ระบุ Plan No ทดสอบ เช่น `MP-2026-W08-001`

## 6) Test Flow ที่ต้องรัน

### Phase A: Master Plan
ผู้ทดสอบ: `UAT_PLN_MGR`
1. เข้า `/production-line/planning/master`
2. สร้างแผนรายสัปดาห์ (Plan No เดียว)
3. Publish master plan

Expected:
- บันทึกสำเร็จ
- Publish สำเร็จ
- แผนถูกส่งต่อไป workbench/inbox

### Phase B: QA Sub Plan + Calculate
ผู้ทดสอบ: `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`
1. เข้า `/production-line/planning/inbox` หรือ `/production-line/planning/plan`
2. เปิด Plan No เดียวกัน
3. QA แต่ละคนแก้/ยืนยันเฉพาะแผนกตัวเอง
4. กด Calculate

Expected:
- แผนกตัวเองแก้ได้
- ข้ามแผนกต้องถูก block (403)
- ได้ผลคำนวณ status เช่น ready/partial/backorder/blocked ตามข้อมูลจริง
- ถ้าขาดวัตถุดิบและมี PO ต้องเห็น ETA

### Phase C: WIP/Material Sufficiency
ผู้ทดสอบ: QA editor
1. ตรวจผล sufficiency
2. สร้าง draft WIP (ถ้าต้องใช้)

Expected:
- เห็นเฉพาะ scope ที่ตนมีสิทธิ์
- ผลสอดคล้องกับ stock + PO + lead time

### Phase D: Requisition Export
ผู้ทดสอบ: QA editor
1. Export ใบเบิกแบบ weekly และ/หรือ daily
2. ตรวจที่หน้า `/raw-material-requisitions/requisition`

Expected:
- Export สำเร็จ
- แยกรายการตาม material owner ถูกต้อง
- เลขเอกสารที่ใช้ import ERP เป็น “เลขใบเบิก” (ไม่ใช่ Plan No)

### Phase E: Control Tower + Exception (ถ้าทดสอบกรณีขาด)
ผู้ทดสอบ: `UAT_EXCEPTION_MGR`
1. เข้า `/production-line/planning/control-tower`
2. ให้ ETA feedback / replan

Expected:
- แผนที่ได้รับผลกระทบถูกอัปเดตตาม ETA
- เหตุผลและสถานะเปลี่ยนตามข้อมูล

## 7) Data Correctness Rules (เกณฑ์ตรวจว่าข้อมูลถูกไหม)

### Rule 1: Scope/Permission
- QA A แก้ได้เฉพาะ A
- QA B แก้ได้เฉพาะ B
- Viewer ดูได้แต่แก้ไม่ได้

### Rule 2: BOM Explosion
- ปริมาณวัตถุดิบต้องแตกจาก BOM ตาม planned qty จริง
- FG -> WIP -> RAW ต้องคำนวณครบชั้น

### Rule 3: Availability Logic
- Required qty เทียบกับ stock คงเหลือสุทธิ
- ถ้าขาดและมี open PO ให้ใช้ ETA จาก PO ก่อน
- ถ้าไม่มี PO ให้ fallback lead time

### Rule 4: Owner Split
- วัตถุดิบใน export ต้องถูกแยกตาม owner department ที่ตั้งใน `material-owners`

### Rule 5: Document Number
- เอกสารส่ง ERP ต้องเป็นเลขใบเบิกจากระบบเรา
- ต้องไม่ใช้ Plan No แทนเลขใบเบิก

## 8) ชุด Negative Tests ที่ต้องผ่าน
- Calculate โดยไม่ส่ง `masterPlanNo` -> 400
- Plan No mismatch ใน payload -> 400
- QA ข้ามแผนกแก้ข้อมูล -> 403
- Viewer พยายามเขียนข้อมูล -> ต้องถูก block

## 9) หลักฐานที่ต้องเก็บ
- Screenshot ราย phase
- Response JSON ของ:
  - `/api/production-planning/calculate`
  - `/api/production-planning/wip-sufficiency`
  - `/api/production-planning/wip-plan/draft`
  - `/api/production-planning/requisition/export`
- หลักฐาน role-based pass/fail ของผู้ใช้ทั้ง 5
- ตารางเทียบผลก่อน/หลัง replan (ถ้ามี)

## 10) Pass/Fail Criteria รอบนี้
- ผ่านทุก Phase A-D (และ E ถ้าทดสอบ exception)
- ไม่พบช่องโหว่ข้ามแผนก/ข้าม owner
- ปริมาณคำนวณตรงกับ BOM + stock + PO ตามข้อมูลทดสอบ
- ใบเบิก export ใช้งานต่อ ERP ได้ด้วยเลขใบเบิกที่ระบบสร้าง

---

## 11) เอกสารเสริมที่ “เปิดเมื่อจำเป็น”
- ข้อมูลตั้งต้น/ตัวอย่าง BOM: `docs/UAT_DATA_PREP_BOM_SIMULATION_FROM_ZERO_2026-02-16.md`
- ตั้งค่า 5 บทบาทใน UI: `docs/UAT_5_ROLES_UI_SETUP_CHECKLIST_2026-02-16.md`

