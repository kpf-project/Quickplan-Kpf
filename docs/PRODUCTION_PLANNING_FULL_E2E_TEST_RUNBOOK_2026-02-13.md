# Production Planning Full E2E Test Runbook

วันที่: 2026-02-13  
อ้างอิงหลัก: `docs/PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`

## 1) วัตถุประสงค์
ใช้เอกสารนี้ทดสอบระบบแบบครบเส้นทางจริง ตั้งแต่:
- ผูก/ตรวจ BOM
- วางแผนหลัก (Master Plan)
- แตกแผนย่อย (Workbench/Sub Plan)
- คุมวัตถุดิบ (Control Tower)
- Replan จาก ETA
- Trace ย้อนรอย main -> sub -> material movement
- ปิดงานด้วย UAT evidence + role verification

---

## 2) ผู้ทดสอบและบทบาท
- `Manager` (หัวหน้าแผน): publish master, replan, approve exception
- `Editor` (QA/หัวหน้าหน้างานแผนก): คำนวณ/แก้ไขเฉพาะแผนกตัวเอง
- `Viewer` (ผู้ดูรายงาน): ดูได้แต่แก้ไม่ได้

> ต้องมีผู้ใช้จริง 3 role นี้ก่อนเริ่มเทส

---

## 3) ข้อมูลทดสอบที่ต้องเตรียม
1. สินค้า FG อย่างน้อย 1 SKU (เช่น `FG-A`)
2. WIP อย่างน้อย 1 SKU (เช่น `WIP-A`)
3. RAW อย่างน้อย 2 SKU (เช่น `RAW-X`, `RAW-Y`)
4. แผนกอย่างน้อย 2 แผนก (เช่น `BISCUIT`, `SNACK`)
5. ผูก owner SKU ให้ชัดเจนแต่ละแผนก
6. มีข้อมูล stock/lot จริงในระบบ
7. มี open PO บางรายการ (ให้เกิด ETA)
8. ตั้งค่า lead time ของวัตถุดิบที่เกี่ยวข้อง

---

## 4) Test Data Template (แนะนำ)
- Master Plan No: `MP-2026-W07-001`
- FG-A แผนสัปดาห์: 16 batch (เทียบได้ 280 ลัง)
- BOM FG-A (ต่อ 1 batch):
  - WIP-A = 0.8 batch
  - RAW-X = 3 kg
- BOM WIP-A (ต่อ 1 batch):
  - RAW-Y = 5 kg

เป้าหมายทดสอบ:
- ทำให้เกิดกรณี `พอผลิต` และ `ไม่พอผลิต` อย่างน้อยอย่างละ 1 เคส
- ทำให้เกิด ETA เลทอย่างน้อย 1 รายการ เพื่อทดสอบ Replan

---

## 5) ขั้นตอนทดสอบแบบละเอียด

## Step A: BOM Setup + Approval Policy (ข้อ 24.5)
1. เข้าหน้า `Production Line > BOM`
2. เลือก `FG-A` แล้วบันทึกสูตรให้ครบ:
   - `base_batch > 0`
   - `base_output_boxes > 0`
   - child material type ผ่าน matrix
3. กดขออนุมัติ BOM
4. ทดสอบเคสผิด:
   - ตั้ง `base_batch = 0` แล้วลองขออนุมัติอีกครั้ง
   - คาดหวัง: ระบบต้อง reject ด้วย policy error
5. อนุมัติ BOM เวอร์ชันที่ถูกต้องด้วย approver flow
6. บันทึกหลักฐาน:
   - ภาพหน้าจอก่อน/หลัง approve
   - ภาพ error policy ตอนตั้งค่าผิด

Expected:
- สูตรที่ไม่พร้อม planning ผ่าน approval ไม่ได้
- สูตรพร้อมใช้จึงผ่านได้

---

## Step B: Department Scope + Owner Validation
1. เข้า `Production Line > Settings > Department Products`
2. ผูก FG/WIP/RAW กับแผนกที่เกี่ยวข้อง
3. ตั้ง owner ของ FG-A ให้แผนกเป้าหมาย
4. เข้า user scope แล้วผูก user editor/viewer กับแผนก

Expected:
- owner มีเพียง 1 แผนกต่อ SKU
- สิทธิ์ edit/view แยกตาม role และ scope

---

## Step C: สร้าง Master Plan (หัวหน้าแผน)
1. ล็อกอินด้วย `Manager`
2. เข้า `Production Line > Planning > Master`
3. เลือกช่วงวันสัปดาห์ทดสอบ
4. ใส่ `Plan No` ตาม pattern มาตรฐาน (เช่น `MP-2026-W07-001`)
5. เพิ่ม FG-A ตามจำนวน batch ที่เตรียมไว้
6. กด `Publish Master Plan`

Expected:
- publish สำเร็จ
- snapshot ถูก freeze (BOM/stock/open PO/open MO/lead time)
- แผนย่อยพร้อมไป Workbench/InBox

หลักฐาน:
- screenshot publish success
- screenshot plan summary

---

## Step D: Workbench คำนวณแผนย่อย (QA/Editor)
1. ล็อกอินด้วย `Editor` ของแผนก
2. เข้า `Planning > Workbench` หรือ `Inbox`
3. ค้นหา `Plan No`
4. ยืนยันว่ารายการแผนกตัวเอง editable, แผนกอื่น read-only
5. กดคำนวณ (Run/Calculate)
6. ตรวจค่าที่ต้องมี:
   - `Feasible Batch`
   - `Short Batch`
   - `Backorder Batch`
   - `Earliest Material ETA`
   - `Exception Reason`
7. ยืนยัน sub plan

Expected:
- ระบบแตก BOM หลายชั้นได้ (FG -> WIP -> RAW)
- ถ้าของไม่พอ ต้องเห็น short/backorder ชัดเจน
- editor แก้ได้เฉพาะ own department

หลักฐาน:
- screenshot workbench ก่อน/หลังคำนวณ
- screenshot row ที่เกิด short/backorder

---

## Step E: Requisition Behavior ตามรูปแบบแผนก
ทดสอบ 2 รูปแบบ:
1. แผนก A เบิกทั้งสัปดาห์
2. แผนก B เบิกรายวัน

วิธีทดสอบ:
- อ้างอิงแผนย่อยจาก Workbench
- ตรวจว่าปริมาณเบิกสอดคล้องกับชุดแผนย่อย
- ถ้าผลิตไม่ได้ ต้องมีหมายเหตุเหตุผลในแถวงาน

Expected:
- ทั้ง 2 แนวทางเบิกทำได้
- ย้อน trace ได้ว่าเบิกของผูกกับแผนไหน

---

## Step F: Control Tower + ETA Feedback + Replan
1. ล็อกอิน `Manager`
2. เข้า `Planning > Control Tower`
3. กรองช่วงวันเดียวกับแผน
4. ตรวจ KPI หลัก:
   - delayed plans
   - short/backorder
   - net gap
5. บันทึก ETA feedback ของวัตถุดิบที่มาช้า
6. สั่ง replan (manual/queue)
7. ตรวจผลหลัง replan:
   - due date / period ขยับตาม ETA
   - exception reason บันทึกครบ

Expected:
- ETA กระทบแผนจริงและเห็นผลใน control tower
- replan queue ทำงานและมี log

หลักฐาน:
- screenshot ก่อน/หลัง ETA feedback
- screenshot replan jobs

---

## Step G: Trace ครบเส้น + Movement Mapping
1. เข้า `Planning > Trace`
2. ค้นหาด้วย `Plan No`
3. ตรวจเส้นทาง:
   - main plans
   - sub plans
   - material impact
   - exception summary
4. ตรวจ section `Material Movement Log`
   - ต้องเห็นประเภท `Issue / PO Receipt / MO Receipt`
   - มีวันที่, เอกสาร, SKU, Qty
5. กดลิงก์ไปหน้าคลังเพื่อตรวจ movement ต้นทาง

Expected:
- trace ถึงระดับ movement จริง
- mapping movement summary ตรงกับข้อมูลธุรกรรมคลัง

หลักฐาน:
- screenshot trace summary
- screenshot movement table

---

## Step H: Report / Expired / Root Cause
1. เข้า `Planning > Report` และ `Planning > Expired`
2. ทดสอบ filter:
   - plan no
   - department
   - plan kind
3. ตรวจว่ามี root cause ระดับรายการ
4. กด action `Replan` / `Trace` จากรายการ

Expected:
- ทีมหน้างานเห็นเหตุผลชัดและกดแก้ได้เร็ว

---

## Step I: Role Verification (Manager/Editor/Viewer)
1. Manager:
   - ต้อง publish/replan ได้
2. Editor:
   - คำนวณ/แก้ไขได้เฉพาะแผนกตัวเอง
3. Viewer:
   - ดูได้ แต่ action เขียนข้อมูลต้องโดน deny (403)

Expected:
- บังคับสิทธิ์ครบทุก action สำคัญ

แนะนำรันสคริปต์:
- `node scripts/verify-planning-role-workflow.mjs`
- `node scripts/run-production-planning-uat-evidence.mjs`

---

## 6) Definition of Done (ต้องครบทุกข้อ)
- [ ] Publish -> Workbench -> Control Tower -> Replan -> Trace ผ่านจริง
- [ ] มีหลักฐาน PASS/FAIL ครบทุก step
- [ ] มี screenshot ครบทุกจุดสำคัญ
- [ ] Role manager/editor/viewer ผ่านตามสิทธิ์
- [ ] Movement mapping ผ่าน (Issue/PO/MO)
- [ ] Sign-off จากผู้เกี่ยวข้องครบ

---

## 7) เอกสารผลทดสอบที่ต้องส่งมอบ
1. `docs/UAT_EXECUTION_LOG_PRODUCTION_PLANNING_FLOW_2026-02-13.md`
2. `docs/ROLE_WORKFLOW_VERIFICATION_2026-02-13.md`
3. รายงานจากสคริปต์ล่าสุด:
   - `docs/UAT_EXECUTION_RESULTS_PRODUCTION_PLANNING_FLOW_*.md`
   - `docs/ROLE_E2E_RESULTS_PRODUCTION_PLANNING_*.md`
   - `docs/MOVEMENT_MAPPING_ACCEPTANCE_*.md`

---

## 8) หมายเหตุสำคัญ
- ถ้า API ใดตอบ error จากสิทธิ์ ระบบ UI ควรไม่ล้มทั้งหน้า (มี fallback)
- ถ้าพบข้อมูลไทยเพี้ยน ให้แก้ encoding ก่อน sign-off
- ห้ามข้ามขั้นตอนเก็บหลักฐาน เพราะเป็นส่วนหนึ่งของ DoD
