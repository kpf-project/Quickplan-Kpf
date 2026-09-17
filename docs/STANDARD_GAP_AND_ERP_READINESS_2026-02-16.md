# Gap Analysis มาตรฐานโรงงาน (MRP + Production + Procurement)

วันที่: 2026-02-16  
ขอบเขตเอกสารนี้: สรุปว่า "ระบบตอนนี้มีอะไรแล้ว", "ยังขาดอะไร", และ "ต้องเช็ค ERP/ระบบภายในอะไรบ้าง" เพื่อประเมินความพร้อมก่อนยกระดับให้ใกล้มาตรฐานโรงงานสากล

---

## 1) มาตรฐานอ้างอิงที่ใช้เทียบ (ภาพใหญ่)

แนวทางโรงงานทั่วไปจะมีโครงแบบนี้:

1. S&OP รายเดือน (ตกลง demand/capacity/inventory policy)
2. MPS รายสัปดาห์ (ล็อกแผนสินค้าสำเร็จรูปช่วงใกล้ผลิต)
3. MRP รายวันหรือ net-change (คำนวณขาด-เกินวัตถุดิบ/กึ่งสำเร็จรูป)
4. Exception management (เร่ง PO, เลื่อน/เร่งแผน, substitute, split lot)
5. Execution + feedback loop (รับของเข้า, เบิก, ผลิตจริง, ปรับแผนรอบถัดไป)

แกนตัดสินใจหลัก:

- ใช้ On-hand ที่ใช้ได้จริง (หักของที่จอง/เบิกแล้ว)
- บวก Scheduled Receipts (PO/WO ที่ยังเปิดและมี ETA ที่เชื่อถือได้)
- เทียบกับ Gross Requirements ตามวันต้องใช้ของ (requirement date)
- ถ้า ETA ไม่ทัน requirement date ต้องขึ้น exception และ replan

---

## 2) ระบบปัจจุบัน "มีแล้ว" (จากโค้ดจริง)

| ความสามารถ | สถานะ | หลักฐาน |
|---|---|---|
| คำนวณสต๊อกจาก ERP + หัก issued ก่อนตัดสินใจ | มี | `src/features/production-planning/services/calculationLogic.js:526`, `src/features/production-planning/services/calculationLogic.js:558` |
| เช็ค Open PO + ETA ในคำนวณ planning | มี | `src/features/production-planning/services/calculationLogic.js:528` |
| ใช้ ETA ปิด shortage และ fallback lead time | มี | `src/features/production-planning/services/calculationLogic.js:91` |
| สถานะผลลัพธ์ ready/partial/backorder/blocked | มี | `src/features/production-planning/services/calculationLogic.js:736` |
| Auto backorder จาก earliest ETA | มี | `src/app/api/production-planning/status/route.js:1354` |
| Control Tower แนะนำ action จากสถานะ/ETA | มี (ระดับคำแนะนำ) | `src/features/production-planning/services/controlTowerService.js:116` |
| Capacity scheduling พื้นฐาน | มี | `src/features/production-planning/services/advancedSchedulingService.js:149` |
| Export requisition ตามแผนให้แต่ละแผนก | มี | `src/app/api/production-planning/requisition/export/route.js:271` |

---

## 3) ระบบปัจจุบัน "ยังขาด" เมื่อเทียบมาตรฐานเต็ม

| ช่องว่าง | ผลกระทบ | หลักฐาน |
|---|---|---|
| ยังไม่บังคับ planning window แบบแข็งใน main calc (ETA ทันช่วงแผนเท่านั้น) | อาจได้ผลคำนวณที่ไม่ตรง expectation รายสัปดาห์ | call ไป Open PO ใส่แค่ `skus` ยังไม่ส่ง `dateFrom/dateTo` ใน calc: `src/features/production-planning/services/calculationLogic.js:523` |
| Main calc ยังไม่ใช้ min/max/min-order/multiple แบบครบ policy | แผนดีเชิงปริมาณ แต่ยังไม่ครบ policy คลัง/จัดซื้อ | ใน main calc map minmax ใช้ lead time เป็นหลัก: `src/features/production-planning/services/calculationLogic.js:575` |
| ใช้ safety stock ชัดใน WIP sufficiency แต่ยังไม่ครบทุก flow | ผลประเมินบางจุดดี แต่ policy ไม่สม่ำเสมอทั้งระบบ | `src/app/api/production-planning/wip-sufficiency/route.js:211` |
| ยังไม่มี Planning Time Fence/Frozen Zone เชิงนโยบายจริง | แผนใกล้วันผลิตอาจแกว่ง | ตอนนี้มี snapshot freeze ตอน publish มากกว่า policy fence: `src/app/api/production-planning/master-publish/route.js:367` |
| ยังไม่มี Action Message workflow แบบมาตรฐาน (advance/postpone/increase/decrease + owner + SLA) | การปิดงาน exception ยังพึ่งคน | `src/features/production-planning/services/controlTowerService.js:116` |
| ยังไม่มี write-back PR/PO เข้า ERP โดยตรง | ต้องพึ่ง export/import/manual step | มี export requisition ไฟล์ แต่ gateway ไม่ได้มี API create PO โดยตรง |

---

## 4) ก่อนยกระดับมาตรฐาน ต้องเช็ค ERP อะไรก่อน

## 4.1 Data model readiness (ERP master data)

เช็คให้ครบต่อ SKU วัตถุดิบ/WIP/FG:

- SKU code, UOM หลัก, conversion UOM
- Lead time จริง (procurement/manufacturing)
- Lot policy (min order, max, multiple, fixed lot)
- Safety stock / reorder policy
- Procurement type (ซื้อ/ผลิตเอง/ทั้งคู่)
- Supplier หลัก/รอง และเงื่อนไขส่งมอบ
- Calendar (ทำงาน/หยุด) ของโรงงานและ supplier

เกณฑ์ขั้นต่ำแนะนำ:

- ข้อมูลสำคัญครบ >= 95% ของ SKU ที่ active
- UOM conversion ไม่มี conflict
- Lead time เป็นค่าที่ review แล้วใน 3 เดือนล่าสุด

## 4.2 Transaction readiness (ERP เอกสารเคลื่อนไหว)

เช็คเอกสารฝั่ง PO/รับของ:

- Open PO line มี `open qty` เชื่อถือได้
- ETA เป็น confirmed date (ไม่ใช่ date ว่าง/placeholder)
- สถานะ cancel/close สะท้อนจริง
- Goods receipt update ตรงเวลา ไม่ค้างย้อนหลัง

เช็ค inventory movement:

- on-hand, reserved, issued, in-transit แยกสถานะได้
- movement lag ไม่เกินเกณฑ์ (เช่น < 15 นาที หรือ ตาม SLA โรงงาน)

## 4.3 Planning inputs readiness (ฝั่งระบบเรา)

ตาราง/ข้อมูลที่ต้องครบ:

- BOM approved และ version ที่ใช้งานจริง
- ownership mapping: `production_material_owners` หรือ fallback ที่ชัดเจน
- department capacity รายวันในช่วง planning horizon
- plan status fields ที่ต้องใช้ตัดสินใจ (due_date, earliest_material_eta, short/backorder)

## 4.4 Integration readiness

ต้องวัด:

- ความถี่ sync ERP -> planning (near real-time หรือ batch)
- cache policy ที่กระทบการตัดสินใจ (เช่น stale 30 วินาทีรับได้ไหม)
- error handling/retry เมื่อ gateway ล่ม
- data lineage และ traceability (ย้อนดูได้ว่า plan ตัดสินใจจากข้อมูลชุดไหน)

---

## 5) Checklist ประเมินความพร้อมแบบลงมือทำ (แนะนำทำ 1-2 สัปดาห์)

## Step 1: Data Profiling (ERP)

1. สุ่ม SKU Active 100-300 ตัวจากแต่ละกลุ่ม (RAW/WIP/FG)
2. ตรวจ completeness ของ lead time, min/max, lot policy, UOM
3. ตรวจ PO open qty vs goods receipt ว่าตรงกัน
4. ตรวจ ETA reliability (ETA เปลี่ยนบ่อยแค่ไหน, มาตรงกี่ %)

## Step 2: Planning Consistency Test

1. เลือก 1 สัปดาห์แผนจริงย้อนหลัง
2. รันคำนวณและเก็บ output status ต่อ plan
3. เทียบกับผลจริงที่เกิดหน้างาน (ผลิตทัน/ไม่ทัน/รอของ)
4. วัด false positive/false negative ของ alert shortage

## Step 3: Exception Closure Test

1. ยกเคสขาดวัตถุดิบ 20 เคส
2. ตรวจว่ามี action ชัดเจนไหม (expedite/replan/split/substitute)
3. วัดเวลาปิดงาน exception เฉลี่ย
4. วัดว่าการแก้ไขช่วยลด backorder ได้จริงหรือไม่

## Step 4: Governance & KPI

กำหนด KPI ขั้นต่ำ:

- Supplier OTD
- Plan stability (จำนวนครั้งที่แก้แผนใน frozen window)
- Stockout rate
- Expedite rate
- Schedule adherence

---

## 6) สิ่งที่ต้องเช็คใน ERP/ระบบเราก่อนตัดสินใจลงทุนพัฒนา

คำถามตัดสินใจที่ต้องตอบให้ได้:

1. ERP ของเรามี `open qty` ที่เชื่อถือได้จริงไหม
2. ETA ที่ใช้อยู่เป็น confirmed ETA หรือแค่ target date
3. Master data (lead time/min-max/lot policy) ครบพอไหม
4. Movement update latency รับได้ไหมสำหรับการวางแผนรายวัน
5. เรามี owner ชัดเจนต่อ material SKU ทุกตัวหรือยัง
6. capacity รายวันมีข้อมูลพอสำหรับ schedule หรือยัง
7. ต้องการ auto write-back PR/PO เข้า ERP หรือคงแบบ export/import

ถ้าตอบ "ไม่" หลายข้อ แนะนำแก้ data quality และ integration ก่อนพัฒนา logic เพิ่ม

---

## 7) Roadmap ยกระดับให้ใกล้มาตรฐาน (แนะนำ)

Phase 1: Stabilize data (เร็วสุด)

1. Data completeness dashboard
2. ETA quality dashboard
3. Mapping owner/capacity ให้ครบ

Phase 2: Policy hardening

1. บังคับ planning window ใน calc
2. ใช้ min/max/lot policy ครบใน main planning
3. เพิ่ม planning time fence

Phase 3: Execution integration

1. Action message workflow พร้อม owner/SLA
2. Closed-loop จาก exception -> ตัดสินใจ -> วัดผล
3. พิจารณา write-back PR/PO เข้า ERP (ถ้ากระบวนการพร้อม)

---

## 8) สรุปสั้น

ระบบตอนนี้อยู่ระดับ "ใช้งานจริงได้ในงานวางแผนพื้นฐานและควบคุม shortage" แล้ว  
แต่ถ้าจะให้ถึง "มาตรฐานโรงงานสากลแบบครบวงจร" ต้องยกระดับ 3 แกน:

1. คุณภาพข้อมูล ERP (โดยเฉพาะ open qty + confirmed ETA + policy fields)
2. กฎ planning เชิงนโยบาย (window, fence, lot policy)
3. วงจรปิด exception-to-action ที่วัดผลได้

