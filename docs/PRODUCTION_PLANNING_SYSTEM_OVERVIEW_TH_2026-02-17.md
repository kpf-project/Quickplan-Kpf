# ภาพรวมระบบ Production Planning (ฉบับอ่านครั้งเดียวเข้าใจทั้งระบบ)

วันที่อัปเดต: 2026-02-18  
สถานะ: สรุปจากโค้ดระบบปัจจุบัน (Backend + Frontend) และเอกสาร flow ล่าสุด

---

## 1) เอกสารนี้ตอบอะไร

เอกสารนี้อธิบายว่า “ระบบที่เราทำไปตอนนี้คืออะไร” แบบครบสำหรับคนที่ไม่เคยเห็นระบบมาก่อน โดยครอบคลุม:

1. เป้าหมายระบบและขอบเขตงานจริง
2. ใครทำอะไรในแต่ละขั้นตอน
3. ข้อมูลไหลจากหน้าจอไหน ไป API ไหน ไปตารางไหน
4. ระบบคำนวณอะไรให้ และอะไรที่ผู้ใช้ต้องกำหนดเอง
5. วิธีเดินงานจริงตั้งแต่วางแผนหลักจน export ใบเบิกเข้า ERP

---

## 2) สรุปสั้นที่สุด (Executive Summary)

ระบบปัจจุบันใช้แนวทางนี้:

1. หัวหน้าวาง `Master Plan` (แผนหลัก) แล้ว `เผยแพร่`
2. QA แต่ละแผนกเข้า `Plan Board` ค้นหา `Plan No` เดียวกัน (ค่าเริ่มต้นเห็นงานทั้งหมด) แต่แก้ไขได้เฉพาะ FG ที่อยู่ในสิทธิ์แผนกตัวเอง
3. QA เป็นคนกำหนด `WIP แผนย่อย` เองแบบ manual (วันไหนทำอะไรเท่าไร)
4. ระบบใช้ `BOM Recursive Explosion (Postgres RPC)` แตกสูตรให้เป็น WIP/RAW และคำนวณ RAW ที่ต้องเบิกจากแผนย่อยที่ QA วาง
5. เมื่อ QA `ยืนยันแผนย่อย` แล้ว วัตถุดิบ RAW จะเข้า `Claim Queue`
6. แต่ละแผนกมา `Claim / Release / Reassign` วัตถุดิบที่รับผิดชอบ
7. ตอน `Export ใบเบิก` ระบบจะ export เฉพาะ RAW ที่ “ถูก claim โดยแผนกนั้น” เพื่อส่งต่อให้คลังเอาไป import ERP

จุดสำคัญ: การ export ปัจจุบันเป็นแนว `claim-only` (ไม่ claim = ไม่ออกใบเบิกให้)

---

## 3) คำศัพท์ที่ต้องเข้าใจก่อน

1. `FG` (Finished Goods): สินค้าสำเร็จที่อยู่ในแผนหลัก
2. `WIP` (Work In Process): งานระหว่างผลิต/สินค้ากึ่งสำเร็จรูป
3. `RAW`: วัตถุดิบที่ใช้เบิกจริงจากคลัง
4. `Master Plan No`: เลขแผนหลัก เช่น `MP-YYYY-Www-XXX`
5. `Sub Plan`: แผนย่อยระดับแผนก (QA กำหนด WIP รายวัน)
6. `Claim`: การรับเจ้าของวัตถุดิบในรอบแผน ณ เวลานั้น
7. `Grain`: ความละเอียดการ claim/export (`daily` หรือ `weekly`)

---

## 4) บทบาทงาน (ภาษาหน้างาน)

1. รองผู้จัดการ/ผู้วางแผนหลัก:
   - วาง FG แผนหลัก
   - เผยแพร่แผนหลัก

2. QA/หัวหน้างานแต่ละแผนก:
   - ค้นหา Plan No ที่ถูกเผยแพร่
   - เห็น FG ทุกแผนกได้ แต่แก้ไขได้เฉพาะ FG ในสิทธิ์ตัวเอง
   - วางแผนย่อย WIP แบบ manual
   - ยืนยันแผนย่อย

3. แผนกย่อย/ผู้รับผิดชอบวัตถุดิบ:
   - เข้ามา claim วัตถุดิบใน queue
   - release/reassign ได้ตามสิทธิ์

4. คลังวัตถุดิบ:
   - export ใบเบิกแต่ละแผนกจากระบบนี้
   - import เข้า ERP และดำเนินการจ่ายจริงใน ERP

---

## 5) Flow ทำงานจริงตั้งแต่ต้นจนจบ

## Phase A: วางแผนหลัก (Master)

1. เข้า `/production-line/planning/master`
2. เลือกสินค้า FG และปริมาณช่วงวันที่
   - เมื่อกดยืนยันจากตัวเลือกสินค้า รายการจะถูกเพิ่มในตารางแผนหลักทันที
   - ถ้าเพิ่ม SKU เดิมในช่วงแผนเดียวกัน ระบบจะรวมจำนวน (batch) ในแถวเดิม
   - ในตารางหน้า Master จะแสดงผลเป็นจำนวน "หน่วยสินค้า" ที่แปลงจาก batch ตามอัตราหน่วยของ SKU
   - ตารางฝั่ง Desktop ปรับเป็นแบบพอดีพื้นที่หน้าจอ (ไม่ต้องเลื่อนซ้าย-ขวา)
3. บันทึกร่างใน `production_plan_status` (สถานะ draft/not_ready)
4. กด `เผยแพร่แผนหลัก`
5. ระบบ update แถวแผนให้มี:
   - `master_published_at`
   - `master_plan_no` มาตรฐาน
   - snapshot ฝั่งแผนหลักใน `production_master_plans`

API หลัก:
- `POST /api/production-planning/master-publish`

---

## Phase B: QA วางแผนย่อย (Plan Board)

1. QA เข้า `/production-line/planning/plan`
2. ค่าเริ่มต้นหน้า Plan Board เป็นมุมมอง `all` (เห็น FG ทุกแผนก) และสลับเป็น `own` ได้
3. ค้นหา `Plan No`
4. ในหน้าเดียวกันมี 2 โซน:
   - `Inbox สรุปแผน` (เลือกแผน)
   - `QA Subplan Workbench` (วางแผนย่อยจริง)

5. QA Workbench ทำงานแบบนี้:
   - โหลด FG ในแผน (แสดงว่าอะไรแก้ไขได้/อ่านอย่างเดียว)
   - กดคำนวณเพื่อดู WIP shortage จาก FG ที่อยู่ในสิทธิ์
   - QA กรอกบรรทัด WIP รายวันเอง (manual)
   - กด preview เพื่อตรวจผลแตก RAW
   - บันทึกร่าง
   - ยืนยันแผนย่อย

สิ่งที่ระบบ “คำนวณให้”:
1. WIP ที่ต้องใช้/พอ/ไม่พอ จาก FG scope ที่แก้ไขได้
2. RAW ที่ต้องเบิกจาก WIP draft lines ที่ QA วาง
3. trace โครงสร้างการแตกสูตร

สิ่งที่ QA “กำหนดเอง”:
1. จะผลิต WIP ตัวไหน วันไหน ปริมาณเท่าไร

API หลัก:
- `GET/POST /api/production-planning/wip-plan/draft`
- `POST /api/production-planning/explosion/preview`
- `POST /api/production-planning/subplan/confirm`
- `GET /api/production-planning/wip-sufficiency`

---

## Phase C: สร้าง Claim Queue จากแผนย่อยที่ยืนยันแล้ว

หลักการ:

1. Queue ถูกสร้างจาก `sub plan ที่ confirmed แล้ว` และอ่านจาก `bom_snapshot` ของแต่ละแถว
2. ตัด WIP ออก เหลือเฉพาะ RAW เพื่อ claim
3. รวมความต้องการตาม grain:
   - รายวัน (`daily`)
   - รายสัปดาห์ (`weekly`)

ผู้ใช้ในหน้า claims:
1. เห็น `Unassigned Queue` เป็นค่าเริ่มต้น (เมื่อยังไม่เลือก filter แผนก)
2. claim วัตถุดิบเข้ารับผิดชอบแผนก
3. เห็น `My Department Claims`
4. release/reassign ได้ตามสิทธิ์
5. ปุ่ม `Claim` จะกดได้เมื่อผู้ใช้มี claim scope ของแผนกปลายทาง

API หลัก:
- `GET /api/production-planning/material-claims/pool`
- `GET /api/production-planning/material-claims/my`
- `POST /api/production-planning/material-claims/claim`
- `POST /api/production-planning/material-claims/release`
- `POST /api/production-planning/material-claims/reassign`

---

## Phase D: Export ใบเบิกเข้า ERP

1. เข้าหน้า `/production-line/planning/claims`
2. เลือก `Plan No + Department + Grain + Date Range`
3. กด Export
4. ระบบจะรวมเฉพาะรายการ RAW ที่:
   - อยู่ในช่วงแผน
   - และถูก claim โดยแผนกนั้น
5. ได้ไฟล์ `.xlsx` สำหรับนำเข้า ERP
6. บันทึกประวัติ export และรายการบรรทัดไว้ใน DB

สำคัญ:
1. ถ้าไม่มีรายการ claim ของแผนกนั้น ระบบจะไม่ export (error)
2. ตอนนี้เป็น `claim-only export` เพื่อกันการเบิกมั่วข้ามแผนก

API หลัก:
- `POST /api/production-planning/requisition/export`

---

## 6) สถาปัตยกรรมการคำนวณ BOM (หัวใจระบบ)

ระบบใช้ RPC ใน Postgres แบบ recursive CTE:

1. `explode_bom_batch` สำหรับคำนวณปริมาณรวม
2. `explode_bom_trace_batch` สำหรับ debug trace ทีละชั้น

ผ่าน wrapper:
- `src/lib/bomExplosionRpc.js`
- `src/lib/bomExplosionTraceRpc.js`

คุณสมบัติ:

1. รองรับ WIP ซ้อน WIP หลายชั้น
2. จำกัดความลึก (`maxDepth`) เพื่อคุม performance
3. ตรวจ cycle ได้ (`hasCycle`)
4. ให้ผลสอดคล้องทั้ง preview/confirm/trace

---

## 7) สิทธิ์และการคุม scope

หลักการหลัก:

1. คนที่มี `production-line-planning-manage` หรือ admin = มอง/จัดการทั้งระบบ
2. คนทั่วไป = มอง/แก้ไขตามแผนกที่เป็น `editor`
3. FG ที่แก้ไขได้อิง mapping จาก `production_department_products (is_owner=true)`
4. claim/release/reassign อิง claim permission + delegation
5. ในหน้า claim pool จะเปิด `canClaim` ตาม claim scope จริง (global หรือแผนกที่ผู้ใช้มีสิทธิ์)

ไฟล์ที่เกี่ยวข้อง:
- `src/lib/planningScope.js`
- `src/lib/claimPermissions.js`
- `src/app/api/production-planning/inbox/route.js`
- `src/app/api/production-planning/status/route.js`

---

## 8) โครงสร้างข้อมูลที่เกี่ยวข้อง

ตารางหลักใน flow นี้:

1. `production_plan_status`
   - เก็บ master/sub plan rows
   - สถานะ, qty, plan no, department owner, bom_snapshot

2. `production_master_plans`
   - เก็บหัวแผนหลัก
   - snapshot ตอน publish

3. `production_sub_plans`
   - เก็บหัวแผนย่อยต่อแผนก
   - สถานะ draft/confirmed

4. `production_material_claims_daily`
5. `production_material_claims_weekly`
6. `production_material_claim_events`
   - claim state + audit trail

7. `production_requisition_exports`
8. `production_requisition_export_lines`
   - ประวัติ export ใบเบิก

9. `production_department_users`
10. `production_department_products`
11. `production_departments`
   - โครงสิทธิ์แผนก

---

## 9) หน้า UI ที่เกี่ยวข้อง

1. หน้าแผนรวม:
   - `/production-line/planning/master`
   - Component หลัก: `src/features/production-planning/components/ProductionPlanningPageClient.js`

2. หน้ากระดานงานแผนก:
   - `/production-line/planning/plan`
   - มี `Inbox` + `QA Subplan Workbench` ในหน้าเดียว
   - Component: `src/features/production-planning/components/QaSubplanWorkbenchClient.js`

3. หน้า claim:
   - `/production-line/planning/claims`
   - Component: `src/features/production-planning/components/MaterialClaimsWorkspaceClient.js`

4. หน้าติดตาม:
   - `/production-line/planning/trace`
   - `/production-line/planning/control-tower`
   - trace/debug endpoint: `/api/production-planning/trace/debug`

---

## 10) แผนภาพ flow (ภาษาคน + ระบบ)

```mermaid
flowchart TD
  A[วางแผนหลัก FG] --> B[Publish Master Plan]
  B --> C[QA เข้า Plan Board ค้นหา Plan No]
  C --> D[QA กรอก WIP แผนย่อยเองรายวัน]
  D --> E[Explosion Preview: WIP sufficiency + RAW preview]
  E --> F[Confirm Subplan]
  F --> G[สร้าง Claim Pool จาก RAW ใน bom_snapshot]
  G --> H[แต่ละแผนก Claim/Release/Reassign]
  H --> I[Export ใบเบิกตามแผนก (Claim-only)]
  I --> J[คลังนำไฟล์เข้า ERP]
```

---

## 11) ตัวอย่างใช้งานจริงแบบเข้าใจง่าย (Pineapple)

โจทย์:

1. แผนหลักต้องผลิตสับปะรดทั้งสัปดาห์ 500 ปี๊บ
2. QA พบว่าต้องใช้ WIP แครกเกอร์รวม 5000 kg แต่สต็อกมี 2000 kg
3. QA ตัดสินใจวาง WIP เพิ่มเอง เช่น
   - จันทร์: แครกเกอร์ 1200
   - อังคาร: แครกเกอร์ 900
   - พุธ: แครกเกอร์ 900

สิ่งที่ระบบทำ:

1. แตกสูตรแครกเกอร์ลงไปอีกชั้น (เช่น แป้งหมัก/แป้งเมนโด/น้ำตาลบด)
2. ถ้าแป้งหมักเองก็แตกต่อไป RAW อีกชั้นให้อัตโนมัติ
3. รวม RAW ทั้งหมดเป็นรายการเบิกตามแผนย่อยที่ QA วางจริง
4. ส่งเข้า Claim Queue ให้แผนกที่เกี่ยวข้องมากด claim
5. Export ใบเบิกแยกตามแผนกที่ claim แล้ว

---

## 12) สิ่งที่ “อยู่ในขอบเขตแล้ว” vs “ยังไม่ทำ”

อยู่ในขอบเขตแล้ว:

1. Master -> Subplan -> Claim -> Export จบ flow
2. WIP ซ้อน WIP ผ่าน recursive BOM explosion
3. QA กำหนดแผนย่อย manual ได้
4. ระบบคำนวณ RAW จากแผนย่อยให้
5. แยกสิทธิ์ตาม FG/แผนก
6. export claim-only เพื่อความถูกต้อง

ยังไม่ใส่เงื่อนไขซับซ้อนตามที่ตกลง:

1. ไม่บังคับ lead/hold time เตือนวันเริ่ม (ตั้งใจทำให้ง่ายก่อน)
2. ไม่ให้ระบบ auto schedule WIP แทน QA

---

## 13) จุดที่ต้องระวังตอนใช้งาน

1. ถ้า BOM SKU ยังไม่ approved จะคำนวณไม่ออก (trace/debug จะช่วยเห็นสาเหตุ)
2. ถ้าไม่ claim RAW ให้ครบ จะ export ใบเบิกไม่ผ่าน
3. QA ต้องบันทึก/ยืนยันแผนย่อยก่อน Claim Queue จึงจะมีข้อมูล
4. สิทธิ์แผนกต้องตั้งใน `production-line/settings/department-products` และ `department-users` ให้ถูก
5. ถ้าเลือก filter แผนกในหน้า Claims จะเห็นเฉพาะรายการที่ claim ให้แผนกนั้น (แถว unassigned จะไม่แสดง)

---

## 14) ลำดับใช้งานสำหรับคนใหม่ (Quick Start)

1. เข้า `Master` วาง FG และเผยแพร่แผนหลัก
2. เข้า `Plan` ค้นหา Plan No
3. ใน `QA Subplan Workbench`:
   - เลือกแผน/แผนก
   - วาง WIP รายวัน
   - preview -> save draft -> confirm
4. เข้า `Claims`:
   - ดู `Unassigned Queue` แล้วเลือกแผนกปลายทางเพื่อ claim
5. กด `Export ใบเบิก` แยกตามแผนก
6. ส่งไฟล์ให้คลังนำเข้า ERP

---

## 15) ไฟล์โค้ดสำคัญที่ควรรู้

แกน flow ใหม่:

1. `src/lib/wipPlanning.js`
2. `src/lib/planningScope.js`
3. `src/app/api/production-planning/explosion/preview/route.js`
4. `src/app/api/production-planning/wip-plan/draft/route.js`
5. `src/app/api/production-planning/subplan/confirm/route.js`
6. `src/app/api/production-planning/wip-sufficiency/route.js`
7. `src/features/production-planning/components/QaSubplanWorkbenchClient.js`
8. `src/features/production-planning/components/ProductionPlanningPageClient.js`

แกน claim/export:

1. `src/lib/materialClaims.js`
2. `src/lib/materialClaimPool.js`
3. `src/lib/claimPermissions.js`
4. `src/app/api/production-planning/material-claims/pool/route.js`
5. `src/app/api/production-planning/material-claims/my/route.js`
6. `src/app/api/production-planning/material-claims/claim/route.js`
7. `src/app/api/production-planning/material-claims/release/route.js`
8. `src/app/api/production-planning/material-claims/reassign/route.js`
9. `src/app/api/production-planning/requisition/export/route.js`

แกน trace/debug:

1. `src/lib/bomExplosionRpc.js`
2. `src/lib/bomExplosionTraceRpc.js`
3. `src/app/api/production-planning/trace/debug/route.js`

---

## 16) เอกสารอ้างอิงภายในที่เกี่ยวข้อง

1. `docs/CLAIM_BASED_MATERIAL_FLOW_TRANSITION_PLAN_2026-02-17.md`
2. `docs/EXPLOSION_TRACE_DEBUG_PINEAPPLE_5KG_2026-02-17.md`

---

## 17) สรุปท้ายเอกสาร

ระบบเวอร์ชันปัจจุบันออกแบบให้ “QA คุมแผนย่อยเอง” และ “ระบบคำนวณ RAW ให้ตรงจากแผนย่อยจริง” จากนั้นใช้ `Claim-based ownership` เพื่อให้การเบิกแยกแผนกชัดเจน ก่อน export เข้า ERP อย่างมีร่องรอยตรวจสอบได้.
