# UAT 5 Roles: ตั้งค่าที่หน้าไหนบ้าง (UI Checklist)

วันที่เอกสาร: 2026-02-16  
วัตถุประสงค์: ตั้งค่า 5 บัญชี UAT ให้ใช้งาน flow วางแผนการผลิตได้ครบตาม scope

---

## 1) ต้องตั้งค่าที่ไหนบ้าง (สรุปสั้น)

มี 3 จุดหลัก:

1. ` /admin/settings `  
- ใช้สร้าง/แก้ Role permission  
- ใช้สร้าง User และผูก Role

2. ` /production-line/settings/department-products `  
- ใช้ผูก User เข้าแผนก (role ในแผนก = `editor` หรือ `viewer`)  
- ใช้ผูก SKU owner ของแต่ละแผนก

3. ` /production-line/settings/material-owners `  
- ใช้ผูกเจ้าของวัตถุดิบ (RAW SKU -> Department)

หมายเหตุ:
- การเข้า `admin/settings` ต้องเป็นผู้ดูแลระบบ (admin)
- ผู้ใช้ UAT ปกติไม่ต้องมีสิทธิ์ตั้งค่าระบบ

---

## 2) ตารางสิทธิ์แนะนำสำหรับ 5 บทบาท

## 2.1 UAT_PLN_MGR (รองผู้จัดการ/ผู้วางแผนหลัก)

Role permission (ใน `admin/settings`):
- `production-line-planning-manage` (หลัก)
- `production-line-planning-view` (เสริม)

Department mapping (ใน `department-products`):
- ไม่จำเป็นต้องผูกเป็น editor ถ้ามี `manage` แล้ว

หน้าที่:
- วางแผนหลัก (master)
- publish
- ดูภาพรวมทั้งระบบ

---

## 2.2 UAT_QA_DEPT_A

Role permission:
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

Department mapping:
- ผูกเข้ากับแผนก A เป็น `editor` (จำเป็น)
- ไม่ผูกกับแผนก B

หน้าที่:
- ทำแผนย่อยและคำนวณเฉพาะแผนก A
- export requisition เฉพาะ scope ที่ตนมีสิทธิ์

---

## 2.3 UAT_QA_DEPT_B

Role permission:
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

Department mapping:
- ผูกเข้ากับแผนก B เป็น `editor` (จำเป็น)
- ไม่ผูกกับแผนก A

หน้าที่:
- ทำแผนย่อยและคำนวณเฉพาะแผนก B

---

## 2.4 UAT_VIEWER

Role permission:
- `production-line-planning-view`
- (แนะนำเพิ่ม) `plan.view_all`

Department mapping:
- ผูกเป็น `viewer` ได้ตามแผนกที่ต้องการให้เห็น
- ห้ามผูกเป็น `editor`

หน้าที่:
- ดูได้อย่างเดียว (master/plan/inbox/report/trace/control-tower)
- แก้ไข/คำนวณ/ยืนยัน/publish ไม่ได้

---

## 2.5 UAT_EXCEPTION_MGR (control tower / approve exception)

Role permission (แนะนำแบบใช้งานจริงไม่ติด scope):
- `production-line-planning-manage`
- `plan.approve_exception`
- `production-line-planning-view`

Department mapping:
- ไม่จำเป็นถ้ามี `manage`

หน้าที่:
- ใช้ control tower
- ให้ ETA feedback
- สั่ง replan/approve exception

---

## 3) ขั้นตอนกดใน UI ทีละขั้น

## Step A: สร้าง/แก้ Role
หน้า: ` /admin/settings `  
แท็บ: `ผู้ใช้งาน > บทบาทและสิทธิ์`

1. สร้าง role ใหม่ 5 ตัวตามชื่อ UAT
2. ติ๊ก permission ตามตารางข้อ 2
3. กดบันทึก

---

## Step B: สร้าง User 5 คน
หน้า: ` /admin/settings `  
แท็บ: `ผู้ใช้งาน > สร้างผู้ใช้ใหม่`

สร้างบัญชี:
- `UAT_PLN_MGR`
- `UAT_QA_DEPT_A`
- `UAT_QA_DEPT_B`
- `UAT_VIEWER`
- `UAT_EXCEPTION_MGR`

แล้วผูก role ให้ตรงคนละบัญชี

---

## Step C: ผูกคนกับแผนก + ผูก SKU owner
หน้า: ` /production-line/settings/department-products `

1. เลือกแผนก A  
- เพิ่ม `UAT_QA_DEPT_A` เป็น `editor`  
- เพิ่ม `UAT_VIEWER` เป็น `viewer` (ถ้าต้องการให้เห็น A)
- ผูก SKU ของแผนก A และตั้ง owner ให้ถูก

2. เลือกแผนก B  
- เพิ่ม `UAT_QA_DEPT_B` เป็น `editor`  
- เพิ่ม `UAT_VIEWER` เป็น `viewer` (ถ้าต้องการให้เห็น B)
- ผูก SKU ของแผนก B และตั้ง owner ให้ถูก

---

## Step D: ผูกเจ้าของวัตถุดิบ
หน้า: ` /production-line/settings/material-owners `

1. กำหนด RAW SKU -> owner department ให้ครบ
2. ตรวจว่าวัตถุดิบสำคัญใน BOM มี owner แล้วทั้งหมด

---

## 4) Smoke Test หลังตั้งค่า (เร็วๆ)

1. ล็อกอิน `UAT_QA_DEPT_A`  
- ต้องแก้/คำนวณได้เฉพาะของแผนก A  
- ถ้าแตะแผนก B ต้องโดน block

2. ล็อกอิน `UAT_QA_DEPT_B`  
- ต้องแก้/คำนวณได้เฉพาะของแผนก B

3. ล็อกอิน `UAT_VIEWER`  
- ต้องเปิดดูได้  
- action เขียนข้อมูลต้องไม่ผ่าน

4. ล็อกอิน `UAT_PLN_MGR`  
- ต้องสร้าง master และ publish ได้

5. ล็อกอิน `UAT_EXCEPTION_MGR`  
- ต้องเข้า control tower ได้  
- ต้อง ETA feedback / replan ได้

---

## 5) จุดที่พลาดบ่อย

- ให้ QA มี role ถูกแล้ว แต่ไม่ได้ผูก `department-products` เป็น `editor`
- ผูก user เข้าแผนกถูก แต่ไม่ได้ตั้ง owner SKU ของแผนก
- ลืมผูก `material-owners` ทำให้ export ใบเบิกไม่ครบตาม owner
- ให้ Viewer มีสิทธิ์ edit/calculate โดยไม่ตั้งใจ

