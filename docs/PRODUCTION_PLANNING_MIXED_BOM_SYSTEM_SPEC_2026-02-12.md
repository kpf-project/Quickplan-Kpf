# Production Planning Mixed BOM System Spec (Scope-True Baseline)

เอกสารอ้างอิง: `PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`  
เวอร์ชันเอกสาร: `v2026-02-16.1`  
สถานะ: `Active` (ใช้เป็นขอบเขตจริงของระบบ)

## 1) วัตถุประสงค์เอกสาร
เอกสารนี้เป็นขอบเขตจริง (single source of truth) ของระบบวางแผนผลิตสำหรับโรงงาน โดยยึดกระบวนการที่ตกลงร่วมกันแล้ว:
- รองผู้จัดการวางแผนหลักรายสัปดาห์ (Master Plan)
- QA แต่ละแผนกวางแผน WIP เฉพาะแผนกที่ตนรับผิดชอบ
- เลขแผน (Plan No) ออกโดยระบบนี้และใช้ต่อเป็นเลขเอกสารใน ERP

## 2) ขอบเขตธุรกิจที่ยืนยันแล้ว

### 2.1 โครงสร้างแผน
- แผนหลัก: `Master Plan` ระดับสัปดาห์ และแตกเป็นรายวัน
- แผนย่อย: `WIP Sub Plan` ตามแผนกเจ้าของงาน
- รองรับ BOM แบบหลายชั้นและ Mixed BOM (FG ใช้ WIP + RAW พร้อมกัน)

### 2.2 ผู้รับผิดชอบ
- `รองผู้จัดการ`: วางแผนหลัก (Master)
- `QA`: วาง/ปรับ WIP เฉพาะแผนกตนเอง
- `คลัง/จัดซื้อ`: ใช้ผลรวมความต้องการเพื่อเบิก/สั่งซื้อ
- `ผู้จัดการ/ผู้บริหาร`: ติดตาม exception และตัดสินใจ

### 2.3 กติกา WIP ที่ใช้จริง
- QA ตรวจ WIP ว่าพอหรือไม่ก่อนผลิต
- ถ้าไม่พอ: วางแผน WIP เพิ่มแบบรายวันทั้งสัปดาห์
- ลูกน้องแต่ละแผนกเบิกของได้ 2 แบบ:
  - เบิกรวมทั้งสัปดาห์
  - เบิกตามชุดแผนรายวัน

## 3) Policy หลักที่ระบบต้องบังคับ

### 3.1 Plan No เป็นคีย์กลาง
- ทุกแผนที่เกี่ยวข้องกับการผลิตต้องมี `Master Plan No` ที่ถูกต้องตาม pattern
- ห้ามทำงานแบบลอย (ไม่มี Plan No) ใน endpoint ที่เป็นงาน plan-bound write

### 3.2 Owner Scope
- ผู้ใช้แก้ได้เฉพาะ SKU/แผนกที่ตนเป็น owner ตาม mapping
- mapping ผู้มีสิทธิ์แก้ไขต่อสินค้าอยู่ที่หน้า:
  - `production-line/settings/department-products`

### 3.3 สถานะผลลัพธ์การผลิต
- ใช้สถานะ policy ระดับแผน: `ready`, `partial`, `backorder`, `blocked`
- หากวัตถุดิบไม่พอ ต้องสะท้อนเป็น `short/backorder` ห้ามกลบปัญหา

## 4) Plan No และเลขเอกสาร ERP

### 4.1 รูปแบบรหัส
- Master Plan No: `MP-YYYY-WWW-XXX`
- Sub Plan No: `SP-YYYY-WWW-XXX-DEPT` (รองรับ suffix `-BO` สำหรับ backorder)

### 4.2 หลักการเชื่อม ERP
- ระบบนี้เป็นผู้กำหนดเลขเอกสารเบิก (`doc_ref`)
- ERP ต้องใช้เลขเอกสารเดิมจากระบบนี้ตอน import (ไม่ generate เลขใหม่ทับ)
- การ reconcile ใช้เอกสารเดียวกัน และจับคู่รายบรรทัดด้วย `TRD_SEQ`

## 5) กระบวนการ End-to-End (โรงงาน)

1. รองผู้จัดการวาง Master Plan รายสัปดาห์/รายวัน
2. Publish Master Plan เพื่อ freeze snapshot ที่จำเป็น
3. QA ตรวจ WIP sufficiency ตาม Master Plan
4. QA วาง WIP Sub Plan เฉพาะแผนกตนเอง
5. สร้างใบเบิกวัตถุดิบจาก Sub Plan (รายวันหรือรายสัปดาห์)
6. ส่งออกไฟล์ไป ERP โดยใช้เลขเอกสารจากระบบนี้
7. Reconcile ERP กลับเข้าระบบเพื่อจับการเปลี่ยนแปลง

## 6) สิทธิ์และการมองเห็น

### 6.1 หลักการ
- `เห็นได้กว้าง` ตามสิทธิ์ view/report
- `แก้ไขได้แคบ` เฉพาะ owner scope

### 6.2 สิทธิ์สำคัญ
- `production-line-planning-manage`
- `plan.view_all`
- `plan.publish_master`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`
- `plan.approve_exception`

## 7) Data Contract ขั้นต่ำที่บังคับ
- ตารางแผน (`production_plan_status`) ต้องมี:
  - `master_plan_no`
  - `sub_plan_no`
  - `owner_department_id`
- ตารางใบเบิกที่เชื่อม ERP:
  - `production_requisition_exports`
  - `production_requisition_export_lines`
- owner mapping:
  - `production_department_products` (`is_owner = true`)

## 8) Endpoint Enforcement Baseline

### 8.1 Plan-bound write endpoint ต้องบังคับ
- บังคับ `masterPlanNo` ที่ valid format
- บังคับ owner scope ก่อนเขียนข้อมูล
- กรณีแก้/ลบจาก `planId` ต้องตรวจว่า row นั้นอยู่ใน `masterPlanNo` เดียวกัน

### 8.2 Read endpoint
- endpoint อ่านข้อมูลบางตัวอนุญาต optional `planNo` ได้
- แต่ยังต้องบังคับ data scope ตามสิทธิ์ผู้ใช้

## 9) ความต่างจากสเปกฉบับเดิม (ที่ยกเลิก)
- ยกเลิกความกำกวมเรื่องผู้วางแผน:
  - แผนหลัก = รองผู้จัดการ
  - WIP แผนย่อย = QA รายแผนก
- ยกเลิกแนวคิดที่ปล่อยให้คำนวณ/แก้โดยไม่มี Plan No
- ยกเลิกการพึ่งสิทธิ์แบบ module-only โดยไม่บังคับ owner scope

## 10) Out of Scope (ระยะนี้)
- APS ระดับละเอียดต่อเครื่องจักร (machine-level finite scheduling)
- optimization ทางคณิตศาสตร์เชิงลึก (heuristic/solver)
- auto procurement execution ภายนอก ERP

## 11) Definition of Done (สำหรับ scope นี้)
- Master Plan และ WIP Sub Plan เดินตามบทบาทจริง
- Plan-bound write endpoint บังคับ Plan No + Owner Scope ครบ
- เอกสารเบิกที่ออกจากระบบใช้เลขเดียวกับ ERP import
- มี reconciliation ที่ตรวจจับการเปลี่ยนแปลงระดับบรรทัดได้

## 12) Material Owner Scope (2026-02-16 Update)
- เพิ่ม mapping ระดับวัตถุดิบ: `production_material_owners`
- หน้าตั้งค่าใหม่: `/production-line/settings/material-owners`
- หลักการใหม่ของใบเบิก:
  - แผนย่อย WIP ยังเป็น owner ตาม SKU (QA/แผนกเจ้าของแผน)
  - แต่การ Export ใบเบิกจะแยกวัตถุดิบตาม `material owner`
  - แต่ละแผนกเบิกเฉพาะวัตถุดิบที่ตัวเองรับผิดชอบ แม้อยู่ในแผนย่อยของอีกแผนก
- Fallback ชั่วคราวเพื่อไม่ให้ระบบสะดุด:
  - ถ้ายังไม่ตั้ง `production_material_owners` สำหรับบาง SKU
  - ระบบจะ fallback ไปใช้ `production_department_products.is_owner = true`
  - แนะนำให้ migrate ไปใช้ material owner ครบทุก SKU วัตถุดิบ/WIP ให้เร็วที่สุด
