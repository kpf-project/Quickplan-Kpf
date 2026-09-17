# BOM + Planning Scope Handover (Full Timeline)
อัปเดตล่าสุด: 2026-02-11

เอกสารนี้คือสรุป "ตั้งแต่เริ่มคุย" ของงานหน้า **BOM ไลน์การผลิต** และหน้า **วางแผนการผลิต (Planning)**
ให้เปิดอ่านแล้วรู้ทันทีว่า:
- เราตกลงอะไรกัน
- ทำอะไรไปแล้ว
- เหลืออะไรที่ต้องปิดงาน

## 1) จุดตั้งต้นที่คุยกัน (ปัญหาจริงหน้างาน)

ผู้ใช้หน้างานมีข้อมูลแบบนี้:
- รู้ว่า `16 batch = 280 ลัง`
- รู้ว่าฐานนี้ใช้ WIP/RAW เท่าไร
- ไม่ได้รู้เสมอว่า "1 batch = กี่ลัง" ล่วงหน้า

สิ่งที่สรุปร่วมกัน:
1. ระบบต้องยึด "ฐานสูตร" ที่ผู้ใช้กรอกจริง ไม่บังคับให้กรอกต่อ 1 ลังเสมอ
2. ผู้ใช้กรอกค่าเริ่มต้น 2 ช่อง
- `base_batch` (เช่น 16)
- `base_output_boxes` (เช่น 280 ลัง)
3. ระบบคำนวณอัตโนมัติ
- `boxes_per_batch = base_output_boxes / base_batch` (เช่น 17.5 ลัง/Batch)
4. รายการวัตถุดิบที่กรอกในสูตร คือปริมาณสำหรับฐานนั้นทั้งก้อน (16 batch / 280 ลัง)

## 2) ขอบเขตธุรกิจที่ตกลงแล้ว (Rules)

### 2.1 Product Type Mapping
- FG: `04`, `04-1`, `04-2`
- WIP: `03`
- RAW: `01`, `02`, `05`, `08`, `10`

### 2.2 Matrix การผูก BOM (สำคัญมาก)
- Parent = FG -> Child ใส่ได้: `WIP`, `RAW`
- Parent = WIP -> Child ใส่ได้: `RAW` เท่านั้น
- Parent = RAW -> ห้ามมี BOM

หมายเหตุสำคัญ:
- `03` ถูกใช้เป็น WIP เท่านั้น (ไม่ถือเป็น RAW)

## 3) Flow ที่ต้องการในหน้า BOM (สรุปแบบใช้งานจริง)

ส่วนหัวสูตร (เดิม "สูตรนี้สำหรับ...") ต้องเป็นแนวนี้:
1. ช่อง Batch ตั้งต้น (`base_batch`)
2. ช่องจำนวนลังตั้งต้น (`base_output_boxes`)
3. ค่าคงที่คำนวณอัตโนมัติ: `1 batch = ... ลัง`

Flow การกรอก:
1. ผู้ใช้ใส่ `base_batch` และ `base_output_boxes`
2. ผู้ใช้กรอกรายการ Child (WIP/RAW) พร้อมจำนวนที่ใช้สำหรับฐานนี้
3. ระบบ validate ตาม matrix ทันที
4. บันทึกสูตรเป็นฐานกลาง
5. ตอนวางแผน ผู้ใช้กรอก batch เท่าไรก็ได้ ระบบ scale ให้จากฐานสูตร

## 4) Flow ที่ต้องการในหน้า Planning

1. เลือกสูตร BOM ที่มี `base_batch` + `base_output_boxes`
2. ผู้ใช้กรอก batch ที่ต้องการผลิตจริง
3. ระบบคำนวณ `scale = planned_batch / base_batch`
4. คูณปริมาณ Child ทุกตัวด้วย scale
5. ถ้า Child เป็น WIP ให้แตกต่อไปหา RAW (multi-level explosion)
6. สรุปผลลัพธ์เป็น:
- FG demand
- WIP demand
- RAW requisition

## 5) สิ่งที่ทำไปแล้ว (Done)

### 5.1 Data Model / Supabase
ทำแล้ว:
- เพิ่มและใช้ `base_batch`, `base_output_boxes` เป็นแกนหลัก
- บังคับค่าต้องมากกว่า 0
- ลบ `base_boxes` ออกจาก schema จริงแล้ว

Migration ที่ใช้:
1. `supabase/migrations/20260415_add_bom_base_batch_and_output_boxes.sql`
2. `supabase/migrations/20260416_enforce_base_batch_output_boxes.sql`
3. `supabase/migrations/20260416_drop_base_boxes_from_production_bom_versions.sql`

ผลลัพธ์:
- ไฟล์/flow ใหม่ต้องใช้ `base_batch/base_output_boxes` เท่านั้น
- รูปแบบเก่า `BaseBoxes/baseBoxes/base_boxes` ต้องไม่ใช้

### 5.2 BOM API / UI
ทำแล้ว:
- API BOM ปรับใช้ฐานใหม่
- หน้า BOM editor แสดงค่า auto `1 batch = x ลัง`
- matrix validation ถูกย้ายมาแบบ explicit
- ข้อความไทยแจ้งเหตุผล "ผิดเพราะอะไร" ระดับแถว/ระดับ SKU

### 5.3 Import / Preview
ทำแล้ว:
- Import preview รองรับฐานใหม่
- Import จริงรองรับฐานใหม่
- บังคับ matrix validation ตอน import
- รองรับเฉพาะคอลัมน์ที่ตกลง

### 5.4 Excel Export/Import
ทำแล้ว:
- ชีทหลัก: `BOM-Input`
- ชีทคู่มือ: `วิธีกรอก`
- ชีทอ้างอิง: `รายการ FG`, `รายการ WIP`, `รายการ RAW`
- ช่องค้นหาแถวกรอกในชีทหลัก + ไฮไลท์สีทองอ่อนที่คอลัมน์ J
- import สนใจเฉพาะคอลัมน์ `A/C/D/E/G/H`

โครงคอลัมน์หลัก (ตามที่ตกลง):
- A รหัสสินค้า
- B ชื่อสินค้า (auto จากรหัส, ล็อกไม่ให้แก้)
- C base_batch
- D base_output_boxes
- E รหัสวัตถุดิบ/WIP
- F ชื่อวัตถุดิบ/WIP (auto จากรหัส, ล็อกไม่ให้แก้)
- G จำนวน
- H หมายเหตุ
- J ช่องค้นหา WIP/RAW(ชื่อ)
- K/L/M แสดงผลค้นหา (รหัส/ชื่อ/หน่วย)

## 6) สิ่งที่คุยไว้ชัด ๆ เรื่องความหมายข้อมูล

1. ในหน้า BOM เราเก็บ "ค่าต่อฐานสูตร" ไม่ใช่ค่าต่อ 1 batch เสมอไป
2. ถ้าใส่ `16` และ `280` แปลว่า รายการวัตถุดิบด้านล่างคือที่ใช้สำหรับ 16 batch
3. ระบบคำนวณต่อ batch ให้เองเมื่อไปหน้า planning
4. ผู้ใช้ไม่จำเป็นต้องรู้น้ำหนักต่อ 1 batch ตั้งแต่ต้น หากมีแค่ข้อมูลฐานก็เริ่มได้

## 7) จุดที่ยังต้องทำต่อให้ครบขอบเขต (Open)

### 7.1 ปิดงาน Excel search ให้เสถียรทุกเครื่อง
- เคยมีอาการพิมพ์ค้นหาแล้วไม่ขึ้น/ขึ้นไม่ครบ
- ตอนนี้แก้จนใช้งานได้ในรอบล่าสุด แต่ต้องยืนยันซ้ำบนเครื่องผู้ใช้จริง

### 7.2 ปิดงาน Auth/Permission 401
เคยเจอ:
- `/api/production-boms/[skuCode]`
- `/api/production-bom-products`

ต้องตรวจ:
1. session/cookie
2. permission key ของหน้าที่เกี่ยวข้อง
3. session expiry

### 7.3 E2E Test Flow จริง (แนะนำให้รันครบ)
1. ผูก WIP ด้วย RAW -> ต้องผ่าน
2. ผูก FG ด้วย WIP/RAW -> ต้องผ่าน
3. ผูก WIP ด้วย WIP -> ต้อง fail
4. ผูก RAW เป็น parent -> ต้อง fail
5. ใส่ฐาน `16/280` แล้ววางแผน `8 batch` -> ปริมาณต้อง scale ครึ่งหนึ่ง

## 8) หน้าไหนใส่อะไร (สรุปสั้นแบบหน้างาน)

หน้า BOM:
- ใส่ฐานสูตร `base_batch` + `base_output_boxes`
- ใส่ child + qty ตามฐานนี้

หน้า Planning:
- ใส่ batch ที่ต้องการผลิตจริง
- ระบบคูณ/หารจากฐานสูตรให้อัตโนมัติ

## 9) ไฟล์หลักที่เกี่ยวข้อง

- `src/lib/bomMatrix.js`
- `src/features/production-line/components/BomEditorPageClient.js`
- `src/features/production-line/components/MultiProductImportPreviewModal.js`
- `src/features/production-line/utils/bomExcel.js`
- `src/app/api/production-boms/[skuCode]/route.js`
- `src/app/api/production-boms/import-batch/preview/route.js`
- `src/app/api/production-boms/import-batch/route.js`
- `src/features/production-planning/services/calculationLogic.js`
- `src/app/api/production-planning/status/route.js`
- `src/app/api/production-bom-versions/[id]/revert/route.js`
- `supabase/migrations/20260415_add_bom_base_batch_and_output_boxes.sql`
- `supabase/migrations/20260416_enforce_base_batch_output_boxes.sql`
- `supabase/migrations/20260416_drop_base_boxes_from_production_bom_versions.sql`

## 10) สถานะภาพรวมปัจจุบัน

- Core model: ไปทิศที่ถูกต้องแล้ว
- Supabase schema: ใช้ฐานใหม่แล้ว และตัดของเก่าแล้ว
- BOM + Planning logic: รองรับฐานสูตร + multi-level ตามขอบเขต
- งานที่ต้องระวังที่สุด: ความเสถียร Excel search และ auth 401 ที่หน้างาน

---
ถ้าจะเริ่มทำต่อทันที:
1. ทดสอบ E2E 1 รอบจากหน้า BOM -> Planning -> Import/Export
2. เก็บ bug จริงจากผู้ใช้
3. ปิดงาน Excel/401 ให้เสถียร
