# คู่มือเทสงานจริง (UAT) Production Planning ตาม Scope ปัจจุบัน

วันที่อัปเดต: 2026-02-16  
ใช้คู่กับเอกสาร: `docs/PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`

## 1) เป้าหมายเอกสารนี้
เอกสารนี้เขียนแบบภาษาคน เพื่อให้ทีมเทสงาน “ตั้งแต่เริ่มจนจบ flow” ได้ทันที โดยตอบ 4 คำถามหลัก:
1. ต้องเข้าหน้าไหนบ้าง
2. ใครทำอะไร
3. อะไรแก้ไขได้/ไม่ได้
4. สิทธิ์ไหนควรมีเพื่อทำงานแต่ละจุด

## 2) บทบาทที่ใช้เทส (แนะนำขั้นต่ำ)

### 2.1 ผู้ใช้ที่ควรเตรียม
- `UAT_PLN_MGR` (รองผู้จัดการ/ผู้วางแผนหลัก)
- `UAT_QA_DEPT_A` (QA แผนก A, role editor)
- `UAT_QA_DEPT_B` (QA แผนก B, role editor)
- `UAT_VIEWER` (ดูอย่างเดียว)
- `UAT_EXCEPTION_MGR` (ผู้จัดการที่ดู control tower / approve exception)

### 2.2 สิทธิ์ที่ควรมีต่อบทบาท

| บทบาท | สิทธิ์ที่ต้องมี |
|---|---|
| รองผู้จัดการ (วางแผนหลัก) | `production-line-planning-view`, `plan.publish_master` |
| QA แผนก (ทำแผนย่อย) | `production-line-planning-view`, `plan.calculate_own_dept`, `plan.edit_own_dept` |
| ผู้จัดการ exception | `production-line-planning-view`, `plan.view_all`, `plan.approve_exception` |
| Viewer | `production-line-planning-view` |
| Admin/Super | `production-line-planning-manage` (ครอบคลุมแก้ได้กว้าง) |

หมายเหตุ: สิทธิ์เข้าหน้า planning มี alias ที่ `src/features/auth/services/authorizeService.js`

## 3) หน้าที่/เมนูที่เกี่ยวข้อง

### 3.1 หน้า setup scope
- `/production-line/settings/department-products`
  - กำหนดแผนก
  - ผูกสินค้าเข้ากับแผนก
  - กำหนด `Owner` ต่อ SKU
  - ผูกผู้ใช้เข้ากับแผนกและกำหนด role `editor/viewer`

### 3.2 หน้า planning หลัก
- `/production-line/planning/master` (รองผู้จัดการ)
- `/production-line/planning/plan` (ทำงานแผน)
- `/production-line/planning/inbox` (QA รับงานจาก Plan No)
- `/production-line/planning/report` (รายงาน)
- `/production-line/planning/expired` (งานค้าง)
- `/production-line/planning/control-tower` (exception dashboard)
- `/production-line/planning/trace` (trace Master -> Sub -> Material)

## 4) เตรียมข้อมูลก่อนเริ่มเทส

1. มี SKU FG/WIP/RAW ที่ใช้ BOM จริง
2. SKU WIP ที่ต้องให้ QA วางแผน ต้องถูกตั้ง owner department แล้ว
3. ผู้ใช้ QA ต้องถูกผูกเข้ากับแผนกที่ตนรับผิดชอบ (role editor)
4. มี stock/purchase data พอให้เห็นเคสพอและไม่พอ

## 5) สคริปต์เทส End-to-End (ตามงานจริง)

## Step A: ตั้ง scope แผนก/สินค้า/ผู้ใช้
ผู้ทดสอบ: `UAT_PLN_MGR` หรือผู้มีสิทธิ์ settings manage

1. เข้า `/production-line/settings/department-products`
2. สร้าง/ตรวจแผนก A และ B
3. ผูก SKU ของแผนก A และ B ให้ครบ
4. ตั้ง Owner SKU (ต้องมี owner เดียวต่อ SKU)
5. ผูก `UAT_QA_DEPT_A` เข้ากับแผนก A (editor)
6. ผูก `UAT_QA_DEPT_B` เข้ากับแผนก B (editor)

ผลที่คาดหวัง:
- SKU แต่ละตัวมี owner ชัดเจน
- QA แผนก A/B มองเห็นและแก้เฉพาะของตัวเองได้

## Step B: รองผู้จัดการวางแผนหลัก (Master Plan)
ผู้ทดสอบ: `UAT_PLN_MGR`

1. เข้า `/production-line/planning/master`
2. เลือกช่วงวันในสัปดาห์
3. เพิ่มรายการ FG หลาย SKU ให้ครอบคลุมแผนก A/B
4. กดคำนวณวัตถุดิบ (ปุ่ม Calculate)
5. ตรวจ Material modal ว่ามี `WIP Demand` / `RAW Requisition`
6. ใส่/ตรวจ `Plan No` ให้เป็นรูปแบบ `MP-YYYY-WWW-XXX`
7. กด `Publish Master Plan`

ผลที่คาดหวัง:
- Publish สำเร็จ
- แถวแผนมีสถานะ publish และอ้างอิง Master Plan No เดียวกัน

## Step C: QA รับงานจาก Plan No และยืนยัน Sub Plan
ผู้ทดสอบ: `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`

1. เข้า `/production-line/planning/inbox`
2. เลือก `Plan No` ที่หัวหน้าพึ่ง publish
3. สลับ scope เป็น `งานแผนกฉัน (Editable)` ก่อน
4. ตรวจว่ามีบางรายการเป็น `Read-only` (ของอีกแผนก)
5. กด `Confirm Sub Plan` เฉพาะรายการ Editable

ผลที่คาดหวัง:
- QA A ยืนยันได้เฉพาะ owner SKU ของแผนก A
- QA B ยืนยันได้เฉพาะ owner SKU ของแผนก B
- แถวที่ไม่ใช่ของตัวเองเห็นได้แต่แก้ไม่ได้

## Step D: แก้ไขแผนยืนยันแล้ว (เฉพาะผู้มีสิทธิ์)
ผู้ทดสอบ: `UAT_QA_DEPT_A` และลองกับ `UAT_VIEWER`

1. ในหน้า plan/report ลองแก้ planned qty ของรายการที่ confirm แล้ว
2. QA owner ต้องแก้ของตัวเองได้
3. ลองให้ QA A แก้ของแผนก B
4. ลองให้ Viewer แก้รายการใด ๆ

ผลที่คาดหวัง:
- owner แก้รายการตัวเองได้
- ข้ามแผนกโดน block (`Department scope violation`)
- viewer แก้ไม่ได้

## Step E: ทดสอบ WIP Sufficiency + Draft WIP (API)
ผู้ทดสอบ: `UAT_QA_DEPT_A` (หรือ QA B)

ใช้ Postman/REST Client หลัง login แล้ว:

### E1) ตรวจ WIP sufficiency
`GET /api/production-planning/wip-sufficiency?masterPlanNo=MP-2026-W07-001`

คาดหวัง:
- ถ้าเป็น QA จะเห็นเฉพาะ WIP ของแผนกที่ตนแก้ได้
- ถ้าไม่ส่ง `masterPlanNo` หรือ format ผิด ต้องได้ 400

### E2) สร้าง draft WIP แผนย่อย
`POST /api/production-planning/wip-plan/draft`
```json
{
  "masterPlanNo": "MP-2026-W07-001",
  "departmentId": "DEPT_A_UUID",
  "regenerateMode": "merge"
}
```

คาดหวัง:
- ได้ draft เฉพาะแผนกที่ผู้ใช้มีสิทธิ์
- ข้ามแผนกไม่ได้

## Step F: ทดสอบ Export ใบเบิก + Reconcile กับ ERP (API)
ผู้ทดสอบ: `UAT_QA_DEPT_A` หรือผู้มีสิทธิ์

### F1) Export ใบเบิก
`POST /api/production-planning/requisition/export`
```json
{
  "masterPlanNo": "MP-2026-W07-001",
  "departmentId": "DEPT_A_UUID",
  "exportMode": "weekly"
}
```

คาดหวัง:
- ได้ไฟล์ Excel
- มี `DI_REF` และ `TRD_SEQ` สำหรับจับคู่ใน ERP
- ถ้าไม่ใช่แผนกตัวเอง ต้องโดน 403

### F2) Reconcile หลัง ERP import
`POST /api/requisitions/reconcile`
```json
{
  "docRef": "RQ-...."
}
```

คาดหวัง:
- ระบบอ่านเอกสารจาก app db และเทียบกับ ERP ตาม `docRef + line_seq`
- ถ้าผู้ใช้ไม่อยู่ในแผนก owner ของเอกสาร ต้องโดน 403

## Step G: ตรวจภาพรวมผู้บริหาร
ผู้ทดสอบ: `UAT_EXCEPTION_MGR`

1. เข้า `/production-line/planning/control-tower`
2. เข้า `/production-line/planning/trace`
3. filter ตาม Plan No / วันที่ / แผนก

คาดหวัง:
- เห็นสรุปแผนและ exception ได้
- สิทธิ์ `plan.approve_exception` ใช้งาน flow exception ได้

## 6) ชุดทดสอบสิทธิ์ (สำคัญ)

### Case 1: QA ข้ามแผนก
- ผู้ใช้: `UAT_QA_DEPT_A`
- ลองแก้/confirm รายการ owner ของแผนก B
- คาดหวัง: ถูก block (403)

### Case 2: ไม่มี Plan No
- เรียก calculate/status write โดยไม่ส่ง `masterPlanNo`
- คาดหวัง: 400

### Case 3: Plan No ไม่ตรง
- PATCH/DELETE โดยส่ง `masterPlanNo` ไม่ตรงกับแถวจริง
- คาดหวัง: 400 (`Plan No mismatch`)

### Case 4: Viewer พยายามแก้
- ผู้ใช้: `UAT_VIEWER`
- ลองแก้ qty / confirm
- คาดหวัง: ไม่ผ่านสิทธิ์

## 7) เช็คลิสต์ “ผ่านครบ scope”

- [ ] รองผู้จัดการสร้างและ publish Master Plan ได้
- [ ] QA แต่ละแผนกทำงานจาก Plan No เดียวกันได้
- [ ] QA แก้ได้เฉพาะของตัวเอง (owner scope จริง)
- [ ] ข้ามแผนกถูกกันครบทั้ง UI และ API
- [ ] Export ใบเบิกใช้เลขเอกสารจากระบบเรา
- [ ] ERP import ใช้เลขเดิม และ reconcile เทียบรายบรรทัดได้
- [ ] ผู้บริหารดู control tower/trace ได้

## 8) สรุปสั้นสำหรับทีมหน้างาน
- หัวหน้าวางแผนหลักที่หน้า `master`
- QA รับงานที่ `inbox` แล้ว confirm เฉพาะงานแผนกตัวเอง
- งานเบิก/ERP ใช้เลขจากระบบเราเท่านั้น
- ถ้าจะแก้ข้ามแผนก ระบบต้องไม่ให้ผ่าน

## 9) Material Owner UAT (เพิ่ม)
### 9.1 ตั้งค่า owner วัตถุดิบ
1. เข้า `/production-line/settings/material-owners`
2. เลือกแผนก
3. ผูกวัตถุดิบ/WIP (iccat 03,04,04-1,04-2) ให้ครบ
4. ตรวจว่าทุกวัตถุดิบที่อยู่ใน BOM สำคัญมี owner แล้ว

### 9.2 ทดสอบ export แยกตามแผนกที่รับผิดชอบวัตถุดิบ
1. ให้ QA สร้าง/ยืนยันแผนย่อย WIP ตามปกติ
2. ล็อกอินผู้ใช้แผนก A แล้ว `POST /api/production-planning/requisition/export`
3. ตรวจว่าไฟล์มีเฉพาะวัตถุดิบของแผนก A
4. ล็อกอินผู้ใช้แผนก B/C แล้วทำซ้ำ
5. ตรวจว่าแต่ละไฟล์ได้คนละชุดวัตถุดิบตาม owner

### 9.3 กติกาผ่าน UAT
- แผนกไม่สามารถ export เอกสารของแผนกอื่นได้ (ต้องได้ 403)
- วัตถุดิบเดียวกันไม่ถูกเบิกซ้ำข้ามแผนกในรอบเดียวกัน
- เอกสารทุกฉบับยังคงอ้างอิง Plan No/Doc Ref จากระบบเดิม
