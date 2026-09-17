คู่มือการเพิ่มหน้า/แท็บและบันทึกสิทธิ์ลงฐานข้อมูล
==================================================

เอกสารนี้อธิบายขั้นตอนแบบละเอียดสำหรับการเพิ่มหน้าใหม่หรือแท็บใหม่
พร้อมวิธีบันทึกสิทธิ์ลงฐานข้อมูล Supabase ให้ทีมทำตามได้ทันที

สารบัญ
------
1) โครงสร้างสิทธิ์ที่ระบบใช้
2) กติกาการตั้งชื่อ (Role/Permission/URL)
3) เพิ่ม "หน้าใหม่" แบบไม่มีแท็บ
4) เพิ่ม "แท็บใหม่" ในหน้าที่มีหลายแท็บ
5) ผูกสิทธิ์กับ Role
6) อัปเดตหน้าตั้งค่าสิทธิ์ (UI)
7) เช็กลิสต์ก่อนจบงาน


1) โครงสร้างสิทธิ์ที่ระบบใช้
-----------------------------
ตารางที่เกี่ยวข้อง:
- public.roles: เก็บบทบาท (role_key, name)
- public.permissions: เก็บสิทธิ์รายหน้า/รายแท็บ (perm_key, label, path, group_key)
- public.role_permissions: ผูก role ↔ permission
- public.user_roles: ผูก user ↔ role

หลักการ:
- 1 หน้า หรือ 1 แท็บ = 1 permission
- คุมสิทธิ์ด้วย "path" (URL) เป็นตัวอ้างอิงหลัก
- Admin ต้องมีสิทธิ์ทั้งหมดเสมอ


2) กติกาการตั้งชื่อ (Role/Permission/URL)
------------------------------------------
Permission key (perm_key):
- หน้า: admin-products, admin-suppliers
- แท็บ: admin-requisitions-return, admin-requisitions-requisition
- public: raw-materials-summary, raw-materials-lot

Path (URL):
- หน้าไม่มีแท็บ: /admin/products
- หน้าแท็บ: /admin/<module>/<tab>
  ตัวอย่าง: /admin/raw-material-requisitions/requisition

Group key (group_key):
- ใช้จัดกลุ่มในหน้า Settings UI เช่น
  - public
  - admin-inventory
  - admin-operations
  - admin-security


3) เพิ่ม "หน้าใหม่" แบบไม่มีแท็บ
----------------------------------
สมมติเพิ่มหน้าใหม่: /admin/vendors

ขั้นตอน:
1) สร้างหน้าใน Next.js
   - สร้างไฟล์: src/app/admin/vendors/page.js
2) เพิ่ม permission ลง DB
   - เพิ่มเข้า public.permissions
3) ผูก permission ให้ role ที่ต้องการ (อย่างน้อย Admin)
4) เพิ่มรายการใน Settings UI (ชั่วคราว ถ้า UI ยังไม่อ่านจาก DB)

ตัวอย่าง SQL:
```sql
insert into public.permissions (perm_key, label, path, group_key)
values ('admin-vendors', 'ผู้ขาย', '/admin/vendors', 'admin-inventory')
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key = 'admin-vendors'
where r.role_key = 'admin'
on conflict do nothing;
```


4) เพิ่ม "แท็บใหม่" ในหน้าที่มีหลายแท็บ
-----------------------------------------
แนวทางมาตรฐาน:
- แต่ละแท็บต้องมี URL ของตัวเอง เช่น /admin/raw-material-requisitions/return
- เพื่อให้คุมสิทธิ์รายแท็บได้จริง

ขั้นตอน (ตัวอย่างเพิ่มแท็บ "อนุมัติ"):
1) เพิ่ม route สำหรับแท็บ
   - src/app/admin/raw-material-requisitions/[tab]/page.js
   - ตัวแท็บต้องใช้ URL แบบนี้: /admin/raw-material-requisitions/approval
2) กำหนด permission สำหรับแท็บนี้
3) ผูก permission กับ role ที่ต้องการ
4) อัปเดต UI ให้มีแท็บใหม่ (และแสดงตามสิทธิ์)

ตัวอย่าง SQL:
```sql
insert into public.permissions (perm_key, label, path, group_key)
values (
  'admin-requisition-approval',
  'ใบเบิกวัตถุดิบ (อนุมัติ)',
  '/admin/raw-material-requisitions/approval',
  'admin-inventory'
)
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key = 'admin-requisition-approval'
where r.role_key = 'admin'
on conflict do nothing;
```

หมายเหตุสำคัญ:
- ถ้าต้องการให้สิทธิ์เป็นรายแท็บจริง ห้ามให้แท็บอยู่ในหน้าเดียวกันโดยไม่มี URL แยก


5) ผูกสิทธิ์กับ Role
--------------------
กรณีมี role ใหม่:
```sql
insert into public.roles (role_key, name, description)
values ('warehouse-supervisor', 'หัวหน้าคลังสินค้า', 'ดูแลระบบคลังสินค้า')
on conflict (role_key) do nothing;
```

ผูกสิทธิ์ให้ role:
```sql
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.perm_key in (
  'admin-products',
  'admin-suppliers',
  'raw-materials-summary'
)
where r.role_key = 'warehouse-supervisor'
on conflict do nothing;
```


6) อัปเดตหน้าตั้งค่าสิทธิ์ (UI)
-------------------------------
ปัจจุบัน UI ใช้รายการสิทธิ์แบบคงที่:
- `src/app/admin/settings/page.js` ในตัวแปร `PERMISSION_GROUPS`

เมื่อเพิ่ม permission ใหม่ ให้เพิ่มเข้า PERMISSION_GROUPS เพื่อให้ติ๊กได้ในหน้า
จนกว่าจะเชื่อมต่อ DB จริง (future: อ่าน permissions จาก Supabase)

ตัวอย่างเพิ่มใน PERMISSION_GROUPS:
```js
{
  id: "admin-vendors",
  label: "ผู้ขาย",
  path: "/admin/vendors"
}
```


7) เช็กลิสต์ก่อนจบงาน
----------------------
- [ ] เพิ่ม route ใหม่แล้ว (URL ใช้งานได้)
- [ ] เพิ่ม permission ลง DB แล้ว
- [ ] ผูก permission กับ Admin แล้ว
- [ ] ผูก permission กับ role อื่น (ถ้าต้องการ)
- [ ] อัปเดต PERMISSION_GROUPS (ชั่วคราว) แล้ว
- [ ] ทดสอบเข้า/ไม่เข้าได้ตาม role


หมายเหตุด้านความปลอดภัย
------------------------
ทุกการสร้าง/แก้ไข role/permission ต้องทำผ่าน server เท่านั้น
ห้ามทำจาก client ตรง ๆ เพราะ RLS จะบล็อก และเสี่ยงด้านความปลอดภัย

8) ข้อมูลแผนก (Departments)
----------------------------------------
- หน้า Settings ดึงแผนกจาก Supabase ผ่าน /api/admin/departments แล้วกรองเฉพาะแผนกที่ active ก่อนส่งให้ dropdown ใน CreateUserForm
- หากอนาคตต้องรวมข้อมูลจาก HR ให้เรียก route src/app/api/hr-departments/route.js (มีการตรวจสิทธิ์ผ่าน requireAdmin) เพื่อ fetch ข้อมูลจาก ${env:KPF_GATEWAY_URL}/api/hr-departments โดยแนบ header x-api-key (KPF_API_KEY) แล้วคืน payload { departments }
- ฝั่ง Settings จะเรียก `adminFetch("/api/hr-departments")` จาก server แล้ว merge ผลลัพธ์กับรายการ Supabase โดยใช้ id ตรวจซ้ำ และเมื่อ HR ยังไม่ตอบให้ fallback เป็น Supabase โดยไม่ขัดการใช้งาน
- การเพิ่มแผนกที่สร้างเองยังใช้ /api/admin/departments เหมือนเดิม ส่วน dropdown จะรวมทั้ง HR กับ custom entries ทันทีที่โหลดหน้าใหม่โดยไม่ต้องแก้โค้ด
