# TestSprite UAT Full Flow (5 Roles) Detailed: Master Plan -> Sub Plan -> Requisition

วันที่เอกสาร: 2026-02-16  
สถานะ: Active (Detailed, UI-first, Role-based)  
อ้างอิงหลัก:
- `docs/TESTSPRITE_CANONICAL_MASTER_TO_REQUISITION_UAT_2026-02-16.md`
- `docs/TESTSPRITE_DETAILED_ONBOARDING_E2E_WITH_MERMAID_2026-02-16.md`
- `docs/UAT_5_ROLES_UI_SETUP_CHECKLIST_2026-02-16.md`

---

## 1) วัตถุประสงค์เอกสารนี้

เอกสารนี้ใช้สั่ง TestSprite ให้ทดสอบ UAT แบบครบเส้นทาง (E2E) ผ่านหน้า UI ตั้งแต่:
- วางแผนหลัก (Master Plan)
- รับงานและทำแผนย่อย (Sub Plan)
- คำนวณ sufficiency/WIP
- Export ใบเบิก (Requisition)
- ตรวจสิทธิ์ทั้ง 5 บทบาทแบบละเอียด

ผลลัพธ์ที่ต้องได้:
- ผ่านทุก phase ตาม scope
- ผ่าน role/security rule ทั้งหมด
- ได้หลักฐานพร้อม sign-off
- มีรายงานสรุปสุดท้ายว่า “ระบบถูกต้องหรือไม่” ทั้งภาพรวมและรายหน้าที่เกี่ยวข้อง

---

## 2) ขอบเขตทดสอบ (Start -> End)

Start:
- BOM ที่ใช้ในรอบนี้เป็น `approved`
- ตั้ง role/user/scope/owner ครบ

End:
- Export ใบเบิกสำเร็จ
- ตรวจความถูกต้องของ scope/owner/quantity/document number ครบ
- มีหลักฐาน JSON + screenshot ครบตาม phase

หมายเหตุสำคัญ:
- เอกสาร import ERP ใช้ “เลขใบเบิก (Requisition No)” ไม่ใช่ Plan No

---

## 3) บทบาทที่ต้องทดสอบ

1. `UAT_PLN_MGR`
2. `UAT_QA_DEPT_A`
3. `UAT_QA_DEPT_B`
4. `UAT_VIEWER`
5. `UAT_EXCEPTION_MGR`

---

## 4) สิทธิ์ที่คาดหวังต่อบทบาท (Expected Permission Matrix)

`UAT_PLN_MGR`
- `production-line-planning-manage`
- `production-line-planning-view`

`UAT_QA_DEPT_A`
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

`UAT_QA_DEPT_B`
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

`UAT_VIEWER`
- `production-line-planning-view`
- `plan.view_all`

`UAT_EXCEPTION_MGR`
- `production-line-planning-manage`
- `plan.approve_exception`
- `production-line-planning-view`

---

## 5) หน้า UI ที่ต้องใช้จริง

หน้าตั้งค่า:
- `/admin/settings`
- `/production-line/settings/department-products`
- `/production-line/settings/material-owners`

หน้าทดสอบ flow:
- `/production-line/planning/master`
- `/production-line/planning/inbox`
- `/production-line/planning/plan`
- `/production-line/planning/control-tower`
- `/production-line/planning/trace`
- `/raw-material-requisitions/requisition`

---

## 6) Preconditions ก่อนเริ่ม (ต้องพร้อม 100%)

1. ผู้ใช้ UAT 5 บัญชีล็อกอินได้
2. ผูก role ถูกครบทั้ง 5 คน
3. Department scope ถูกต้อง:
- QA A = `editor` เฉพาะแผนก A
- QA B = `editor` เฉพาะแผนก B
- Viewer = `viewer`
4. `department-products` ผูก SKU owner ครบสำหรับ SKU ที่จะเทส
5. `material-owners` ผูก RAW owner ครบ
6. BOM ที่ใช้เป็น `approved`
7. มีข้อมูล ERP runtime สำหรับ SKU ที่เทส:
- Stock
- Open PO + ETA
- Min/Max + Lead Time
8. กำหนด Plan No รอบทดสอบ เช่น `MP-2026-W08-001`

---

## 7) ชุดข้อมูลทดสอบที่ใช้ในรอบนี้ (Current Canonical UAT Seed)

ใช้ข้อมูลจริงที่มีในระบบ (ไม่ใช่ mock):

FG:
- `B01-1014`

WIP:
- `WK-0001`
- `WK-0002`

RAW:
- `M01-00049`
- `M01-0006`
- `M01-0006-1`
- `M01-0006-2`

BOM chain ที่ต้องเห็น:
- `B01-1014 -> WK-0001`
- `B01-1014 -> WK-0002`
- `B01-1014 -> M01-00049`
- `WK-0001 -> WK-0002` (กรณี WIP -> WIP)
- `WK-0001 -> M01-0006`
- `WK-0001 -> M01-0006-1`
- `WK-0002 -> M01-00049`
- `WK-0002 -> M01-0006`
- `WK-0002 -> M01-0006-2`

---

## 8) Flow ทดสอบเต็มระบบ (Phase A -> E)

### Phase A: Master Plan
ผู้ทดสอบ: `UAT_PLN_MGR`

Steps:
1. เข้า `/production-line/planning/master`
2. สร้าง Master Plan ใหม่ (Plan No เดียว)
3. ใส่รายการแผนผลิตของ SKU FG ที่ใช้เทส (`B01-1014`)
4. Publish Master Plan

Expected:
- Save สำเร็จ
- Publish สำเร็จ
- แผนถูกส่งต่อไป inbox/workbench
- Plan อยู่สถานะพร้อมให้ QA ดำเนินการ

Evidence:
- Screenshot หน้า master ก่อน/หลัง publish
- Plan No ที่ใช้ในรอบทดสอบ

### Phase B: QA Sub Plan + Calculate
ผู้ทดสอบ: `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`

Steps:
1. เข้า `/production-line/planning/inbox` หรือ `/production-line/planning/plan`
2. เปิด Plan No เดียวกัน
3. QA A ทำงานเฉพาะ scope แผนก A
4. QA B ทำงานเฉพาะ scope แผนก B
5. กด Calculate

Expected:
- แก้ไขได้เฉพาะแผนกตัวเอง
- ข้ามแผนกต้องโดน block (403/read-only)
- ได้สถานะ `ready/partial/backorder/blocked` ตามข้อมูลจริง
- เมื่อมี shortage และมี PO ต้องเห็น ETA
- ควรเห็นโครงสร้างแตก BOM ที่รวมกรณี `WIP -> WIP`

Evidence:
- Screenshot ก่อน/หลัง calculate
- JSON `/api/production-planning/calculate`

### Phase C: WIP / Sufficiency / Draft
ผู้ทดสอบ: QA editor

Steps:
1. ตรวจผล sufficiency
2. สร้าง WIP draft (ถ้า flow รอบนั้นใช้)
3. ตรวจผลซ้ำใน plan/inbox

Expected:
- เห็นเฉพาะข้อมูลใน scope
- ผลสอดคล้อง BOM explosion + stock + PO + lead time
- ไม่มีข้อมูลข้าม scope โผล่ให้แก้ไข

Evidence:
- JSON `/api/production-planning/wip-sufficiency`
- JSON `/api/production-planning/wip-plan/draft`

### Phase D: Requisition Export
ผู้ทดสอบ: QA editor

Steps:
1. Export ใบเบิก (weekly และ/หรือ daily)
2. เข้า `/raw-material-requisitions/requisition`
3. ตรวจเลขเอกสารและรายการที่ export

Expected:
- Export สำเร็จ
- รายการ split ตาม `material owner` ถูกต้อง
- เอกสาร ERP ใช้เลขใบเบิกจากระบบ (ไม่ใช่ Plan No)

Evidence:
- JSON `/api/production-planning/requisition/export`
- Screenshot หน้า requisition list/detail

### Phase E: Control Tower + Exception Loop
ผู้ทดสอบ: `UAT_EXCEPTION_MGR`

Steps:
1. เข้า `/production-line/planning/control-tower`
2. ให้ ETA feedback กับรายการที่ขาด
3. สั่ง replan
4. ตรวจผลที่เปลี่ยนใน plan/trace

Expected:
- Action สำเร็จตามสิทธิ์
- สถานะ/เหตุผล/ETA อัปเดตตาม feedback
- Trace มองเห็น before/after

Evidence:
- Screenshot control-tower และ trace
- ตารางเปรียบเทียบก่อน/หลัง replan

---

## 9) ชุด Test Cases รายละเอียด (Role + Data + Security)

### TC-01 Master Publish Success
Role: `UAT_PLN_MGR`  
Expected: publish สำเร็จ, plan ส่งต่อ inbox

### TC-02 QA A Edit Own Scope
Role: `UAT_QA_DEPT_A`  
Expected: แก้เฉพาะ A ได้

### TC-03 QA B Edit Own Scope
Role: `UAT_QA_DEPT_B`  
Expected: แก้เฉพาะ B ได้

### TC-04 QA A Cross-Dept Forbidden
Role: `UAT_QA_DEPT_A`  
Action: พยายามแก้ข้อมูล B  
Expected: `403` หรือ read-only

### TC-05 QA B Cross-Dept Forbidden
Role: `UAT_QA_DEPT_B`  
Action: พยายามแก้ข้อมูล A  
Expected: `403` หรือ read-only

### TC-06 Viewer Read-Only
Role: `UAT_VIEWER`  
Action: ลองแก้/คำนวณ/ยืนยัน  
Expected: block/forbidden

### TC-07 Exception Manager Control Tower
Role: `UAT_EXCEPTION_MGR`  
Expected: เข้าหน้า control-tower ได้และสั่ง action ได้

### TC-08 BOM Explosion Includes WIP->WIP
Role: QA editor  
Expected: เห็น path `FG -> WIP -> WIP -> RAW` ในผลคำนวณ/trace

### TC-09 Availability With Stock Enough
Data: stock พอ  
Expected: status ส่วนใหญ่เป็น `ready`

### TC-10 Availability With PO ETA
Data: stock ไม่พอแต่มี PO ETA  
Expected: `partial/backorder` พร้อม ETA

### TC-11 Availability Without PO
Data: stock ไม่พอและไม่มี PO  
Expected: fallback lead time + `blocked/backorder`

### TC-12 Requisition Owner Split
Expected: รายการถูก split ตาม owner department

### TC-13 Document Number Rule
Expected: Export ใช้ Requisition No ไม่ใช่ Plan No

### TC-14 Traceability
Expected: ค้นด้วย Plan No แล้วย้อน main/sub/material impact ได้ครบ

### TC-15 Calculate Missing masterPlanNo
Expected: `400`

### TC-16 Payload Plan No Mismatch
Expected: `400`

### TC-17 Viewer Write API Forbidden
Expected: forbidden

### TC-18 Cycle Protection (System Safety)
Expected: ระบบไม่ยอมรับ BOM ที่สร้าง loop

### TC-19 Self-Reference Protection
Expected: ระบบไม่ยอมรับ `A -> A`

### TC-20 Depth Guard Protection
Expected: chain ลึกเกิน policy ถูกปฏิเสธ

---

## 10) Data Correctness Rules (ต้องตรวจทุกเคส)

1. Scope/Permission
- QA A แก้ได้เฉพาะ A
- QA B แก้ได้เฉพาะ B
- Viewer อ่านอย่างเดียว

2. BOM Explosion
- แตกชั้นครบตามสูตร approved
- รอบนี้ต้องตรวจให้เห็นกรณี `WIP -> WIP`

3. Availability Logic
- Required qty เทียบ stock สุทธิ
- ถ้าขาดและมี PO ใช้ ETA จาก PO
- ไม่มี PO ต้อง fallback lead time

4. Owner Split
- Export split ตาม `material-owners` ที่ตั้งไว้จริง

5. Document Number
- เอกสารที่ส่ง ERP ต้องเป็นเลขใบเบิกจากระบบ

---

## 11) หลักฐานที่ต้องเก็บ (Sign-off Package)

1. Screenshot ครบทุก phase A-E
2. JSON response ของ:
- `/api/production-planning/calculate`
- `/api/production-planning/wip-sufficiency`
- `/api/production-planning/wip-plan/draft`
- `/api/production-planning/requisition/export`
3. ตาราง pass/fail role-based ครบ 5 users
4. ตาราง before/after กรณี ETA feedback + replan
5. ระบุ Plan No และช่วงเวลาทดสอบชัดเจน

---

## 12) Pass / Fail Criteria

Pass เมื่อ:
1. ผ่าน Phase A-D ครบ (และ Phase E ถ้าทดสอบ exception)
2. Role/security rule ผ่านทั้งหมด ไม่มี cross-dept privilege leak
3. ผลคำนวณสอดคล้อง BOM + stock + PO + lead time
4. Export ใบเบิกใช้งานต่อ ERP ได้ด้วยเลขใบเบิก
5. มีหลักฐานครบพร้อม audit/review

Fail เมื่อ:
1. มี action write ที่ viewer ทำได้
2. QA แก้ข้ามแผนกได้
3. BOM explosion ไม่ตรงสูตร approved
4. Owner split/export document rule ผิด
5. หลักฐานไม่ครบ

---

## 13) รูปแบบผลเทสที่ต้องส่งกลับ (Mandatory Output)

หลังเทสเสร็จ ต้องส่งผลกลับครบทั้ง 4 ระดับ:

1. Overall Verdict (ภาพรวมระบบ)
- `PASS` หรือ `FAIL`
- สรุป 1 ย่อหน้าว่าระบบทำงานถูกต้องครบ flow หรือไม่

2. Per-Page Verdict (รายหน้าที่เกี่ยวข้องทั้งหมด)
- ต้องระบุสถานะรายหน้าเป็น `PASS`/`FAIL` พร้อมเหตุผลสั้น:
  - `/production-line/planning/master`
  - `/production-line/planning/inbox`
  - `/production-line/planning/plan`
  - `/production-line/planning/control-tower`
  - `/production-line/planning/trace`
  - `/raw-material-requisitions/requisition`
  - (หน้าตั้งค่า) `/production-line/settings/department-products`
  - (หน้าตั้งค่า) `/production-line/settings/material-owners`

3. Per-Role Verdict (ทั้ง 5 สิทธิ์)
- `UAT_PLN_MGR`, `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`, `UAT_VIEWER`, `UAT_EXCEPTION_MGR`
- ระบุ pass/fail + จุดที่ผ่าน/ไม่ผ่าน

4. Defect Summary
- รายการ defect ทั้งหมด (ถ้ามี)
- ความรุนแรง (High/Medium/Low)
- ขั้นตอน reproduce สั้นๆ
- หน้า/role/API ที่ได้รับผลกระทบ

---

## 14) Prompt สำหรับ TestSprite (คัดลอกไปใช้ได้ทันที)

```text
Run full UI UAT for Production Planning from Master Plan to Requisition export.
Use document:
- docs/TESTSPRITE_UAT_FULL_FLOW_5_ROLES_DETAILED_2026-02-16.md
- docs/TESTSPRITE_CANONICAL_MASTER_TO_REQUISITION_UAT_2026-02-16.md

Test all 5 roles:
UAT_PLN_MGR, UAT_QA_DEPT_A, UAT_QA_DEPT_B, UAT_VIEWER, UAT_EXCEPTION_MGR.

Use Plan No for this run and capture evidence per phase.
Validate:
1) Role scope and security (403/forbidden where expected)
2) Data correctness (BOM explosion, stock, PO ETA, lead time)
3) Owner split and requisition document number rule
4) WIP->WIP chain behavior in BOM explosion

Include positive and negative tests and attach:
- screenshots
- JSON responses for calculate, wip-sufficiency, wip-plan/draft, requisition/export
- role-based pass/fail matrix
- before/after replan comparison

At the end, provide final testing report with:
1) Overall Verdict (system works correctly or not),
2) Per-Page Verdict for all related pages,
3) Per-Role Verdict for all 5 roles,
4) Defect Summary with severity and impacted pages/APIs.
```

---

## 15) หมายเหตุสำหรับผู้รันเทส

1. เอกสารนี้ตั้งใจให้เป็น “ฉบับลงมือจริง” ในหน้า UI
2. หาก runtime ERP data ไม่พร้อมในช่วงเวลาทดสอบ ให้บันทึกเป็น blocked พร้อมหลักฐาน
3. หากพบข้อผิดพลาดด้านสิทธิ์ ให้จัด severity เป็นสูง (security regression)
