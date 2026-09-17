# Test cerate 5 users role

วันที่สรุป: 2026-02-16

## สิ่งที่ทำไปแล้ว (Supabase)

ดำเนินการผ่าน MCP Supabase เรียบร้อยแล้ว:

1. สร้าง/ยืนยัน Role UAT 5 บทบาท
- `UAT_PLN_MGR` (`role_key: uat-pln-mgr`)
- `UAT_QA_DEPT_A` (`role_key: uat-qa-dept-a`)
- `UAT_QA_DEPT_B` (`role_key: uat-qa-dept-b`)
- `UAT_VIEWER` (`role_key: uat-viewer`)
- `UAT_EXCEPTION_MGR` (`role_key: uat-exception-mgr`)

2. สร้าง/ยืนยันผู้ใช้ UAT 5 บัญชี
- `UAT_PLN_MGR` -> `uat.pln.mgr@kpfoods.co.th`
- `UAT_QA_DEPT_A` -> `uat.qa.dept.a@kpfoods.co.th`
- `UAT_QA_DEPT_B` -> `uat.qa.dept.b@kpfoods.co.th`
- `UAT_VIEWER` -> `uat.viewer@kpfoods.co.th`
- `UAT_EXCEPTION_MGR` -> `uat.exception.mgr@kpfoods.co.th`

3. ผูก Role ให้ผู้ใช้แบบ 1 คนต่อ 1 Role ใน `public.user_roles`

4. ผูกแผนกใน `public.production_department_users`
- `UAT_QA_DEPT_A` -> `DPM-A` เป็น `editor`
- `UAT_QA_DEPT_B` -> `DPM-B` เป็น `editor`
- `UAT_VIEWER` -> `DPM-A` และ `DPM-B` เป็น `viewer`
- `UAT_PLN_MGR` และ `UAT_EXCEPTION_MGR` ไม่มี department mapping (ตามเอกสาร)

5. สร้างแผนก `DPM-A` เพิ่ม (เพราะเดิมยังไม่มี) และใช้งาน `DPM-B` เดิม

6. รัน Smoke Test SQL ตาม checklist แล้วผลผ่าน
- users exist: PASS
- role assignment exactly one: PASS
- role permissions match expected: PASS
- department scope mapping: PASS
- manager/exception no dept mapping: PASS

---

## หน้าที่และสิทธิ์ของแต่ละ Role

### 1) UAT_PLN_MGR
หน้าที่:
- วางแผนหลัก (Master Plan)
- Publish แผนหลัก
- ดูภาพรวมทั้งระบบ

สิทธิ์:
- `production-line-planning-manage`
- `production-line-planning-view`

หมายเหตุ:
- ไม่จำเป็นต้องผูก department เป็น `editor` เมื่อมีสิทธิ์ `manage`

### 2) UAT_QA_DEPT_A
หน้าที่:
- ทำแผนย่อยของแผนก A
- คำนวณ/แก้ไขเฉพาะขอบเขตแผนก A
- Export requisition ตาม scope ที่ได้รับ

สิทธิ์:
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

Department scope:
- `DPM-A` = `editor`
- ห้ามแก้ข้ามไปแผนก B

### 3) UAT_QA_DEPT_B
หน้าที่:
- ทำแผนย่อยของแผนก B
- คำนวณ/แก้ไขเฉพาะขอบเขตแผนก B

สิทธิ์:
- `production-line-planning-view`
- `plan.calculate_own_dept`
- `plan.edit_own_dept`

Department scope:
- `DPM-B` = `editor`
- ห้ามแก้ข้ามไปแผนก A

### 4) UAT_VIEWER
หน้าที่:
- ดูข้อมูลอย่างเดียว (ไม่แก้ไข)
- ใช้ติดตาม master/plan/inbox/report/trace/control-tower ได้ตามสิทธิ์

สิทธิ์:
- `production-line-planning-view`
- `plan.view_all`

Department scope:
- `DPM-A` = `viewer`
- `DPM-B` = `viewer`

ข้อจำกัด:
- ห้าม calculate/edit/confirm/publish

### 5) UAT_EXCEPTION_MGR
หน้าที่:
- ใช้งาน Control Tower
- ให้ ETA feedback
- สั่ง replan / approve exception

สิทธิ์:
- `production-line-planning-manage`
- `plan.approve_exception`
- `production-line-planning-view`

หมายเหตุ:
- ไม่จำเป็นต้องผูก department เมื่อมีสิทธิ์ `manage`

---

## ข้อมูลเข้าสู่ระบบ (สำหรับ UAT)

- รหัสผ่านชั่วคราวที่ตั้งไว้: `UatPass#2026`
- แนะนำให้เปลี่ยนรหัสผ่านทันทีหลังเข้าระบบครั้งแรก
