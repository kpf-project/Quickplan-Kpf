# Production Planning Mixed BOM Walkthrough + Checklist

วันที่: 2026-02-14  
อ้างอิงสเปค: `docs/PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`

เอกสารนี้เป็น walkthrough “ทำงานจริงตั้งแต่ Draft -> Calculate -> Apply/Confirm -> Publish -> Inbox/Workbench -> Control Tower”
พร้อม checklist ว่าแต่ละขั้น “ต้องเห็นอะไร” (UI), “ต้องยิง API อะไร”, และ “ต้องมี field อะไร” (DB/response) เพื่อยืนยันว่าระบบเป็นไปตามสเปคจริง

---

## 0) Preconditions (ต้องพร้อมก่อนเริ่ม)

### 0.1 สิทธิ์ผู้ใช้ตามสเปค (RBAC + Data Scope)
สเปคข้อ 16 แนะนำ action permissions:
- `plan.view_all`
- `plan.publish_master`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`
- `plan.approve_exception`

สิ่งที่ต้องตรวจ:
- เปิดหน้า `/production-line/planning/master` ได้ (Planner/Manager)
- เปิดหน้า `/production-line/planning/inbox` ได้ (Department)
- เห็นแผนทั้งหมดได้ แต่แก้ไขได้เฉพาะของตัวเอง (own scope editable, all scope read-only cross-dept)

จุดอ้างอิงโค้ด:
- Auth/middleware: `middleware.js`
- Authorize aliases: `src/features/auth/services/authorizeService.js`
- Permission guards: `src/lib/permissionGuard.js`
- Inbox scope/can_edit: `src/app/api/production-planning/inbox/route.js`

### 0.2 BOM ต้องเป็น Approved
เพราะ calculation ใช้ `production_boms -> production_bom_versions(status=approved) -> production_bom_items`

สิ่งที่ต้องตรวจ:
- SKU ที่จะวางแผน (FG) มี BOM approved อย่างน้อย 1 สูตร
- ถ้า Mixed BOM: ต้องมีทั้ง WIP และ RAW อยู่ใน BOM เดียวกันได้
- ถ้า Multi-level: WIP ที่ถูกเรียกใช้ ต้องมี BOM approved ต่อด้วย

จุดอ้างอิงโค้ด:
- Fetch BOM approved: `src/features/production-planning/services/calculationLogic.js` (`fetchApprovedBomsBySkus`)

---

## 1) Step 1: สร้าง Draft Master Plan (FG เป็น batch)
สเปค: ข้อ 5 Step 1, ข้อ 19.1 (Master Planning)

### UI
หน้า: `/production-line/planning/master`
ทำ:
1. เลือกช่วงวัน (Start/End)
2. เลือก FG
3. ใส่จำนวน planned เป็น `batch`
4. กดยืนยันเพื่อให้แถว Draft โผล่ในตาราง

สิ่งที่ควรเห็น:
- แถว Draft แสดง SKU/ชื่อ/ช่วงวัน/จำนวน batch
- มี Plan No (อ้างอิงสเปคข้อ 17: Master Plan No)

### API/DB
ยิง:
- `POST /api/production-planning/status` (สร้าง/อัปเดตแถวใน `production_plan_status`)

field ที่ควรเกิดใน `production_plan_status` (draft):
- `plan_id`
- `sku_code`, `sku_name`
- `planned_qty` (หน่วย batch)
- `status` = `not_ready` หรือ `draft`
- `period_start`, `period_end`
- `plan_group_id` (จะถูก normalize ให้เป็น master plan no มาตรฐานภายหลัง)
- `plan_kind` = `main` (ถ้ายังไม่มี covering main)

จุดอ้างอิงโค้ด:
- UI -> persist: `src/features/production-planning/hooks/useProductionPlanning.js` (`handleBatchAdd`)
- API -> upsert: `src/app/api/production-planning/status/route.js`

Checklist:
- [ ] แถว Draft ถูกสร้างใน `production_plan_status`
- [ ] planned_qty เป็น batch
- [ ] มี plan_group_id ที่ตามหาแผนได้

---

## 2) Step 2: Run Calculation (Explosion + Netting + Demand Breakdown)
สเปค: ข้อ 5 Step 2–3, ข้อ 9, ข้อ 6–7

### UI
หน้า: `/production-line/planning/master`
ทำ:
1. เลือกแถว(หรือช่วง)ที่ต้องคำนวณ
2. กด `Calculate Materials/BOM`

สิ่งที่ควรเห็นในผลคำนวณ (อย่างน้อย):
- `FG Demand`
- `WIP Demand`
- `RAW Requisition`
- `Warnings / Exceptions`

### API/Logic
ยิง:
- `POST /api/production-planning/calculate`

หลักการคำนวณที่เกิดจริงในโค้ด:
1. โหลด BOM approved ของ FG + recurse ลง WIP (multi-level) และรองรับ mixed BOM
2. รวม demand:
   - FG demand (batch)
   - WIP demand (ตาม scale)
   - RAW requirement (หน่วยตาม BOM)
3. โหลด stock/min-max/PO ETA จาก gateway แล้วหัก issued ด้วย `applyStockDeduction`
4. ทำ feasible ratio ต่อแต่ละ plan line:
   - `feasibleBatch`, `shortBatch`, `backorderBatch`, `earliestMaterialEta`, `exceptionReason`

จุดอ้างอิงโค้ด:
- Handler: `src/app/api/production-planning/calculate/route.js`
- Core logic: `src/features/production-planning/services/calculationLogic.js`

Checklist:
- [ ] Calculation modal แสดง 4 section (FG/WIP/RAW/Warn)
- [ ] มี `planSummaries` ต่อ planId พร้อม feasible/short/backorder + ETA

---

## 3) Step 3: Apply/Confirm ผลคำนวณ (ทำให้มี feasible/short/backorder ในแผน)
สเปค: ข้อ 6, ข้อ 8, ข้อ 9, ข้อ 19.2 (Workbench)

### UI
ทำ:
1. ใน calculation modal เลือกแถวที่จะ apply/confirm
2. กด Apply/Confirm

สิ่งที่ควรเกิด:
- แผนจาก draft เปลี่ยนเป็นสถานะ policy (ready/partial/backorder/blocked)
- ในแถวงานควรเห็นตัวเลข:
  - Planned Batch
  - Feasible Batch
  - Short Batch
  - Backorder Batch
  - Earliest Material ETA
  - Exception Reason

### API/DB
ยิง:
- `POST /api/production-planning/status` (records ที่ status เป็น confirmed)

field ที่ควรถูกเขียนใน `production_plan_status`:
- `status` ∈ `ready|partial|backorder|blocked`
- `confirmed_at`, `confirmed_by`
- `feasible_batch`, `short_batch`, `backorder_batch`
- `earliest_material_eta`
- `exception_reason`
- `bom_snapshot` (ควรมีสูตร/วัสดุที่ใช้ตอน confirm)

จุดอ้างอิงโค้ด:
- UI payload builder: `src/features/production-planning/hooks/useProductionPlanning.js` (`handleApplySelection`)
- API upsert + auto backorder: `src/app/api/production-planning/status/route.js`

Checklist:
- [ ] confirm แล้ว status ไม่ใช่ draft/not_ready
- [ ] feasible/short/backorder/ETA ถูกบันทึกจริงใน DB
- [ ] bom_snapshot ถูก freeze ไว้ที่แผนที่ confirm

---

## 4) Step 4: Auto Backorder Creation (เมื่อของไม่พอ)
สเปค: ข้อ 7.1, ข้อ 6 ตัวอย่าง B

### Trigger
กรณีที่ `short_batch` หรือ `backorder_batch` > 0 ใน record ที่ confirm

### Expected DB Behavior
ระบบจะสร้างแถวใหม่ “backorder” อัตโนมัติ:
- `plan_id` ต่อท้าย `__BO`
- `parent_plan_id` ชี้กลับแถวต้นทาง
- `status` = `backorder`
- `planned_qty` = pendingBatch (อิง backorder/short)
- `period_start/period_end` เลื่อนไปหลัง ETA หรือหลังงวดเดิม

จุดอ้างอิงโค้ด:
- `src/app/api/production-planning/status/route.js` (`autoBackorderPayload`)

Checklist:
- [ ] มีแถว `__BO` ถูกสร้างเมื่อ short/backorder > 0
- [ ] parent_plan_id ถูกต้อง
- [ ] period_start เลื่อนไปหลัง ETA/หลังงวดเดิมตาม policy

---

## 5) Step 5: Publish Master Plan (Freeze snapshot ระดับ Master)
สเปค: ข้อ 19.1 Step 3–5, ข้อ 17

### UI
หน้า: `/production-line/planning/master`
ทำ:
1. ใส่ Plan No (หรือให้ระบบใช้ Plan No มาตรฐานของ draft)
2. กด `Publish`

สิ่งที่ควรเห็น:
- มีสถานะ Published ใน master view
- มี master plan published confirmation

### API/DB
ยิง:
- `POST /api/production-planning/master-publish`

ผลที่ควรเกิด:
1. `production_master_plans` มี row ของ `master_plan_no`
2. `production_master_plan_snapshots` มี history insert
3. `production_plan_status` rows ถูกอัปเดต:
   - `master_published_at`
   - `master_plan_no`
   - `plan_group_id` ถูก set เป็น canonical master plan no

จุดอ้างอิงโค้ด:
- API: `src/app/api/production-planning/master-publish/route.js`

Checklist:
- [ ] publish แล้ว `master_published_at` ไม่เป็น null
- [ ] master_plan_no เป็นรูปแบบ `MP-YYYY-WWW-XXX`
- [ ] snapshot ถูกบันทึก (meta + stock/open PO/open MO/lead time)

---

## 6) Step 6: Inbox/Workbench ตามแผนก (Own scope editable, All scope read-only cross-dept)
สเปค: ข้อ 16, ข้อ 19.2, ข้อ 20

### UI
หน้า: `/production-line/planning/inbox`
ทำ:
1. เลือก scope:
   - `own` (editable only)
   - `all` (เห็นทั้งหมด)
2. filter Plan No / SKU / ชื่อสินค้า / แผนก
3. เปิดแผนและกด `Confirm Sub Plan` (เฉพาะ own scope)

สิ่งที่ควรเห็น:
- แผนกตัวเอง: แก้ไขได้ (`Editable`)
- แผนกอื่น: อ่านอย่างเดียว (`Read-only`)
- ควรมีสถานะสรุปตามสเปค: ready/partial/backorder/blocked + feasible/short/backorder + ETA

### API
ยิง:
- `GET /api/production-planning/inbox?scope=own|all&planNo=...&q=...`
และใช้ `can_edit` เพื่อ enforce read-only

จุดอ้างอิงโค้ด:
- API: `src/app/api/production-planning/inbox/route.js`

Checklist:
- [ ] scope=own ไม่เห็นแผนกอื่น
- [ ] scope=all เห็นแผนกอื่นแต่แก้ไม่ได้
- [ ] search/filter ทำงานจาก Plan No/SKU/ชื่อ (กันทำผิดแผนตามสเปคข้อ 20)

---

## 7) Step 7: Material Control Tower (รวม demand ข้ามแผนก)
สเปค: ข้อ 19.3

หน้า: `/production-line/planning/control-tower`

Expected:
- สรุป demand วัตถุดิบรวม (issue vs PO)
- เห็น exception/late availability
- ใช้สำหรับคลัง/จัดซื้อ/ผู้จัดการในการตัดสินใจ replan

จุดอ้างอิงโค้ด:
- API: `src/app/api/production-planning/control-tower/route.js`

Checklist:
- [ ] มี demand รวมและ drilldown ตาม Plan No/ช่วงวัน/แผนก
- [ ] แสดง ETA/late availability

---

## 8) สรุปความสอดคล้องกับสเปค (Quick Verdict Template)
กรอกหลัง run walkthrough:
- Draft creation (batch): PASS/FAIL: ___
- Explosion mixed + multi-level: PASS/FAIL: ___
- Netting (stock + issued + PO ETA): PASS/FAIL: ___
- Feasible/Short/Backorder + ETA recorded: PASS/FAIL: ___
- Auto backorder creation: PASS/FAIL: ___
- Publish freeze snapshot: PASS/FAIL: ___
- Inbox RBAC (own/all): PASS/FAIL: ___
- Control tower aggregation: PASS/FAIL: ___

