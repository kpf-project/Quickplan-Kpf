# แผนเปลี่ยนระบบวัตถุดิบจาก Owner แบบตั้งค่าคงที่ -> Claim-based

วันที่: 2026-02-17  
ขอบเขต: Production Planning / Sub Plan / Requisition Export / Department Scope / Delegation

---

## 1) เป้าหมายเอกสารนี้

เอกสารนี้สรุปครบ 3 ส่วน:

1. ระบบเดิมของเราทำงานอย่างไร (As-Is)
2. ปัญหาของ Owner แบบผูกตายราย SKU
3. แผนเปลี่ยนเป็น Claim-based แบบใช้งานจริงได้ก่อน และยังคงความปลอดภัยเรื่องสิทธิ์

---

## 2) ภาพรวมระบบเดิม (As-Is)

## 2.1 Flow ธุรกิจ 3 ชั้น (ภาษาคน)

1. รองผู้จัดการวาง `แผนใหญ่` (Master Plan) ว่าจะผลิต FG อะไร ปริมาณเท่าไร
2. QA แตกเป็น `แผนย่อย` จากแผนใหญ่ โดยดู WIP ที่เกี่ยวข้องและเช็คว่า WIP พอหรือไม่
3. แต่ละแผนกวัตถุดิบเบิกของตามส่วนที่ตัวเองรับผิดชอบ (และบางวัสดุ QA เบิกเองได้ หาก owner อยู่ที่ QA)

## 2.2 หลักฐานจากระบบปัจจุบัน

1. มี flow แผนย่อยตามแผนกและบังคับ owner department สำหรับ sub plan  
ไฟล์: `src/app/api/production-planning/status/route.js:1161`
2. มี API ประเมิน WIP พอ/ไม่พอจาก master plan  
ไฟล์: `src/app/api/production-planning/wip-sufficiency/route.js`
3. มี API สร้าง draft WIP sub plan รายวันตามแผนก  
ไฟล์: `src/app/api/production-planning/wip-plan/draft/route.js`
4. มี API export ใบเบิก โดยแยกวัตถุดิบตาม material owner และรองรับ fallback  
ไฟล์: `src/app/api/production-planning/requisition/export/route.js`
5. มีหน้าตั้งค่า owner วัตถุดิบแบบราย SKU  
ไฟล์: `src/app/api/production-material-owners/route.js`

## 2.3 Rule ownership เดิมที่ใช้งานอยู่

การหาเจ้าของวัตถุดิบใน export ปัจจุบัน:

1. หา explicit owner จาก `production_material_owners`
2. ถ้าไม่เจอ fallback ไป `production_department_products` (is_owner=true)
3. ถ้ายังไม่เจอ จะไม่สามารถ export วัตถุดิบนั้นให้แผนกได้ครบ

หมายเหตุ: ระบบเดิมรองรับกรณี QA เบิกเองได้อยู่แล้ว ถ้าตั้ง owner ของวัตถุดิบนั้นไว้ที่แผนก QA

---

## 3) ปัญหาที่เจอในโมเดลเดิม

1. ต้องผูก owner ราย SKU เองตลอด
2. มีวัตถุดิบใหม่ต้องมานั่งตั้งค่าเพิ่มเสมอ
3. งานหน้างานจริงเปลี่ยนบ่อย แต่ owner เป็นแบบคงที่ ทำให้ยืดหยุ่นยาก
4. การมอบหมายแทนชั่วคราวยังไม่เป็นระบบกลาง (ต้องอาศัยเปลี่ยนสิทธิ์/role แบบ workaround)
5. ถ้า setup ไม่ครบ จะกระทบ flow export/reconcile ทันที

---

## 4) เป้าหมายระบบใหม่ (To-Be): Claim-based

## 4.1 แนวคิดหลัก

เปลี่ยนจาก “กำหนดเจ้าของล่วงหน้าทุก SKU” เป็น “ให้แผนกรับงานวัตถุดิบ (Claim) ต่อรอบแผน”

ผลที่ต้องได้:

1. ลดงานตั้งค่ามือ
2. ยังคงเห็นเฉพาะข้อมูลตามสิทธิ์
3. รองรับการทำแทนชั่วคราวแบบมีวันหมดอายุ
4. QA สามารถ claim และเบิกเองเฉพาะบางวัสดุได้

## 4.2 Priority rule ใหม่ (แนะนำ)

เรียงลำดับการตัดสินใจ ownership ตอน export:

1. `Claim` ในรอบแผน (สูงสุด)
2. `Explicit material owner` (เดิม)
3. `Fallback product owner` (เดิม)
4. `Unassigned` (ต้องมีคน claim ก่อน export จริง)

---

## 5) Business Flow ใหม่แบบใช้งานจริง

## Step A: รองผู้จัดการวางแผนใหญ่

เหมือนเดิม: สร้างและ publish master plan

## Step B: QA ทำแผนย่อย

เหมือนเดิม: ดู WIP sufficiency, สร้าง/ยืนยัน sub plan

## Step C: เข้าคิววัตถุดิบ (Claim Queue)

ระบบจะรวม demand วัตถุดิบจาก sub plan แล้วเปิดคิว:

1. รายการที่ยังไม่มีเจ้าของ = `Unassigned`
2. แผนกที่เกี่ยวข้องกด `Claim` วัสดุที่ตนรับผิดชอบ
3. รายการที่ถูก claim จะล็อก owner ชั่วคราวในรอบแผนนั้น

## Step D: เบิกวัตถุดิบ

1. Export ใบเบิกจะดึงเฉพาะวัสดุที่แผนกนั้น claim/เป็นเจ้าของ
2. แยกให้เห็นทั้ง “ยอดรวม” และ “แยกตามแผนกต้นทาง/วันใช้งาน”
3. QA สามารถเบิกเองเฉพาะรายการที่ QA claim ได้

## Step E: มอบหมายแทนชั่วคราว

หัวหน้าสามารถมอบหมายให้ผู้ใช้อีกคนทำ claim/release/reassign แทนได้ตามช่วงเวลา (`valid_from` - `valid_to`)

---

## 6) สิ่งที่ต้องพัฒนา

## 6.1 Database (MVP)

### ตารางใหม่: `production_material_claims`

วัตถุประสงค์: เก็บผู้รับผิดชอบวัสดุ “ตามรอบแผน”

คีย์แนะนำ:

1. `master_plan_no`
2. `material_sku_code`
3. `work_date` (หรือ weekly bucket ถ้าต้องการแบบรายสัปดาห์)

คอลัมน์หลัก:

1. `department_id`
2. `claimed_by`
3. `claimed_at`
4. `status` (`claimed`, `released`)
5. `source` (`manual_claim`, `auto_claim`, `fallback`)
6. `note`

constraints/index:

1. unique active claim ต่อ (`master_plan_no`, `material_sku_code`, `work_date`)
2. index ตาม `department_id`, `master_plan_no`, `status`

### ตารางใหม่: `production_material_claim_events`

วัตถุประสงค์: audit trail ทุก action (`claim`, `release`, `reassign`, `auto-assign`)

### ตารางใหม่: `production_department_delegations` (สำหรับทำแทนชั่วคราว)

คอลัมน์หลัก:

1. `delegator_user_id`
2. `delegate_user_id`
3. `department_id`
4. `permissions` (jsonb หรือ enum array)
5. `valid_from`
6. `valid_to`
7. `is_active`

## 6.2 API ใหม่ (MVP)

1. `GET /api/production-planning/material-claims/pool`
2. `GET /api/production-planning/material-claims/my`
3. `POST /api/production-planning/material-claims/claim`
4. `POST /api/production-planning/material-claims/release`
5. `POST /api/production-planning/material-claims/reassign`

payload สำคัญควรมี:

1. `masterPlanNo`
2. `materialSkuCode`
3. `workDate`
4. `departmentId`
5. `reason` (optional)

## 6.3 API เดิมที่ต้องแก้

### `POST /api/production-planning/requisition/export`

เพิ่ม logic:

1. ดึง claim map ตาม `masterPlanNo + workDate + materialSku`
2. ถ้ามี claim ให้ใช้ claim owner ก่อน
3. ถ้าไม่มี claim ค่อย fallback owner เดิม
4. มี option เปิดโหมด strict: ถ้ายัง unassigned ให้ block export

### `GET /api/production-planning/wip-sufficiency`

ไม่จำเป็นต้องแก้ core มาก แต่แนะนำเพิ่ม meta:

1. วัสดุที่ยัง unassigned กี่รายการ
2. วัสดุที่ claim แล้วกี่รายการ

## 6.4 UI ใหม่

เพิ่มแท็บใน planning เช่น `Material Claims`:

1. มุม `Unassigned Queue`
2. มุม `My Department Claims`
3. มุม `Cross-department Summary` (เห็นยอดรวม + แตกตามแผนก/วัน)
4. ปุ่ม `Claim`, `Release`, `Reassign` ตามสิทธิ์

สำหรับเคส “น้ำตาลรวมจากหลายแผนก” ต้องมี:

1. ยอดรวมทั้งสัปดาห์
2. รายแผนกที่ใช้
3. รายวัน

## 6.5 Permission ใหม่

เพิ่ม permission keys:

1. `plan.claim_material`
2. `plan.release_claim`
3. `plan.reassign_claim`
4. `plan.view_claim_all` (manager)

และให้ระบบคำนวณ `effective permissions = direct role + delegation ที่ยังไม่หมดอายุ`

---

## 7) แนวทาง RLS และความปลอดภัย (อิง Supabase)

แนวทางที่ควรใช้:

1. ใช้ RLS บนตาราง claim/delegation
2. policy แบบแผนก: ผู้ใช้เห็นได้เฉพาะแผนกตนเองหรือที่ได้รับมอบหมาย
3. ทำ helper function ใน schema `private` แบบ `SECURITY DEFINER` เท่าที่จำเป็น
4. ใช้ `(select auth.uid())` ใน policy เพื่อลด overhead
5. ใส่ index ให้คอลัมน์ที่ใช้ใน RLS predicates

อ้างอิง Supabase (ผ่าน Context7):

1. RLS guide  
https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx
2. RLS performance & best practices  
https://github.com/supabase/supabase/blob/master/apps/docs/content/troubleshooting/rls-performance-and-best-practices-Z5Jjwv.mdx
3. RBAC / custom claims  
https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/custom-claims-and-role-based-access-control-rbac.mdx

---

## 8) Migration Plan (แนะนำแบบลดความเสี่ยง)

## Phase 0: Preparation

1. freeze requirement + นิยาม claim grain (`daily` vs `weekly`)
2. เตรียม migration SQL + index + RLS
3. เพิ่ม feature flag `ENABLE_MATERIAL_CLAIMS`

## Phase 1: Dual-write / Read-old

1. เริ่มเก็บ claim data ได้ แต่ export ยังใช้ owner เดิมเป็นหลัก
2. เปิด UI Claim ให้เฉพาะ pilot user
3. เก็บ metrics เรื่อง claim coverage

## Phase 2: Claim-first with fallback

1. export ใช้ claim ก่อน
2. ถ้าไม่มี claim fallback owner เดิม
3. แจ้งเตือนรายการ unassigned ในหน้า planning

## Phase 3: Strict mode (optional)

1. ถ้า unassigned เกิน threshold ให้ห้าม export
2. บังคับ SLA ปิดงาน claim ก่อน cutoff

---

## 9) Definition of Done (MVP)

1. แผนกสามารถ claim วัตถุดิบเองได้ในรอบแผน
2. Export แยกตาม claim owner ถูกต้อง
3. QA claim และเบิกเองบางวัสดุได้
4. ผู้ใช้เห็นเฉพาะ scope ตัวเอง (รวม delegated scope)
5. การมอบหมายแทนชั่วคราวหมดอายุอัตโนมัติ
6. มี audit log ครบทุก action

---

## 10) UAT Checklist สำหรับ Claim-based

1. Claim สำเร็จ 1 รายการ และแผนกอื่น claim ซ้ำไม่ได้
2. Release แล้วรายการกลับไป Unassigned
3. Reassign โดยผู้มีสิทธิ์ทำได้ และมี event log
4. ผู้ใช้ไม่มีสิทธิ์แผนกนั้นต้องได้ 403
5. Delegation ยังไม่หมดอายุ -> ทำแทนได้
6. Delegation หมดอายุ -> ทำแทนไม่ได้
7. Export ของแผนก A ต้องมีเฉพาะวัสดุที่ A claim/own
8. กรณีไม่มี claim ต้อง fallback ตาม policy ที่กำหนด

---

## 11) KPI หลังใช้งานจริง

1. % วัตถุดิบที่มี claim ก่อน cutoff
2. จำนวน unassigned คงค้างต่อ Plan No
3. เวลาเฉลี่ยจาก publish -> claim complete
4. อัตรา export fail เพราะ ownership ไม่ครบ
5. จำนวน reassign/release ต่อสัปดาห์

---

## 12) Open Decisions (ต้องตกลงก่อนเริ่ม dev)

1. Claim grain ใช้รายวันหรือรายสัปดาห์
2. Strict mode เปิดเมื่อไร
3. ใครมีสิทธิ์ reassign ข้ามแผนก
4. fallback order สุดท้ายควรเป็น owner เดิมหรือ block ไปเลย
5. ต้องการ auto-claim จาก rule (prefix/iccat/warehouse) ใน phase ไหน

---

## 13) สรุปผู้บริหาร (สั้น)

ระบบเดิมใช้งานได้ แต่ผูก owner แบบราย SKU ทำให้ maintenance สูงและไม่ยืดหยุ่น  
Claim-based จะลดงาน manual, รองรับ QA เบิกเองบางส่วน, คุมสิทธิ์แบบแผนกได้เหมือนเดิม และเพิ่มการทำแทนชั่วคราวแบบปลอดภัย  
แนวทางแนะนำคือ rollout แบบค่อยเป็นค่อยไปด้วย feature flag และ fallback เพื่อไม่สะดุดหน้างาน

