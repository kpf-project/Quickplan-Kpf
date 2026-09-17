# UAT Data Prep + BOM Simulation (From Zero)

วันที่เอกสาร: 2026-02-16  
สถานะ: ใช้งานได้ทันทีสำหรับ UAT

## 1) คำตอบสั้น
- ได้ สามารถ “จำลองสูตร BOM ในไลน์ผลิต” เพื่อเทสครบทั้งระบบได้
- แต่มีข้อมูลบางส่วนที่ทีมคุณต้องเตรียมเอง (โดยเฉพาะ master data ที่ผูก ERP จริง)

## 2) อะไรที่ผมจำลองให้ได้ vs อะไรที่ต้องเตรียมเอง

จำลองให้ได้ (ในระบบ Production Line):
- สินค้าทดสอบ FG/WIP/RAW
- สูตร BOM แบบหลายชั้น (FG -> WIP -> RAW)
- สิทธิ์ผู้ใช้ตาม role UAT
- Department scope และ Material owner
- แผนหลักรายสัปดาห์ + แผนย่อย QA + คำนวณ + export ใบเบิก

ต้องเตรียมเอง (เพื่อให้ผลเทสตรงของจริง):
- ข้อมูล stock ปัจจุบันจาก ERP
- ข้อมูล Open PO + ETA จาก ERP
- Mapping รหัสซื้อขายจริงที่ใช้ตอน import ERP (ใบเบิก)
- รายชื่อผู้ใช้ UAT จริง (หรือบัญชีทดแทนที่สิทธิ์เทียบเท่า)

## 3) ชุดข้อมูลจำลองขั้นต่ำ (แนะนำ)

### 3.1 SKU ชุดทดสอบ
- FG: `FG-BUN-001` ขนมปังนึ่ง
- WIP: `WIP-DOUGH-001` โดว์หลัก
- WIP: `WIP-FERMENT-001` แป้งหมัก
- WIP: `WIP-MENDO-001` แป้งเมนโด
- RAW: `M01-0004` น้ำตาลทราย (หน่วยฐาน KG)
- RAW: `M01-0005` แป้งสาลี (KG)
- RAW: `M01-0006` ยีสต์ (KG)
- RAW: `M01-0007` เกลือ (KG)

หมายเหตุ:
- รหัสซื้อขายทางเลือก เช่น `M01-00040` (ถุง 50KG) ให้ใช้ตอน “เบิก/ERP” ไม่ใช่ owner page
- Owner ใช้ระดับ SKU ฐาน (หนึ่ง SKU มี owner ได้หนึ่งแผนกในระบบปัจจุบัน)

### 3.2 BOM ตัวอย่างสำหรับจำลอง
- BOM ของ `FG-BUN-001` (ต่อ 1 batch):
1. `WIP-DOUGH-001` = 1.000 batch
2. `M01-0004` = 2.000 KG

- BOM ของ `WIP-DOUGH-001` (ต่อ 1 batch):
1. `WIP-FERMENT-001` = 0.600 batch
2. `WIP-MENDO-001` = 0.400 batch

- BOM ของ `WIP-FERMENT-001` (ต่อ 1 batch):
1. `M01-0005` = 18.000 KG
2. `M01-0006` = 0.300 KG
3. `M01-0004` = 1.200 KG

- BOM ของ `WIP-MENDO-001` (ต่อ 1 batch):
1. `M01-0005` = 22.000 KG
2. `M01-0007` = 0.500 KG
3. `M01-0004` = 0.800 KG

### 3.3 หน่วยและสต็อกสำหรับเทส
- หน่วยฐาน BOM ใช้ `KG` ทั้งหมด
- ตั้ง stock ให้เกิด 2 เคส:
1. เคสพอ: `M01-0005` >= 300 KG, `M01-0004` >= 40 KG
2. เคสไม่พอ: ลด `M01-0006` เหลือ 0.5 KG

### 3.4 Open PO + Lead Time
- Open PO ของ `M01-0006` = 5 KG, ETA อีก 2 วัน
- Lead time `M01-0007` = 3 วัน
- Min/Max ใส่ค่าตามจริง หรือค่าทดสอบขั้นต่ำ (เช่น Min 10, Max 100)

## 4) ผู้ใช้ UAT ที่ต้องมี
- `UAT_PLN_MGR` (รองผู้จัดการ/วางแผนหลัก)
- `UAT_QA_DEPT_A` (QA แผนก A, editor)
- `UAT_QA_DEPT_B` (QA แผนก B, editor)
- `UAT_VIEWER` (อ่านอย่างเดียว)
- `UAT_EXCEPTION_MGR` (control tower / approve exception)

## 5) ตั้งค่าหน้าไหนก่อนเทส (เรียงลำดับ)

1. ตั้งสูตร BOM  
หน้า: `/production-line/bom`
- สร้าง/แก้สูตรของ FG + WIP ทั้งหมด
- ตรวจ `base_batch > 0` และ `base_output_boxes > 0`
- ส่งอนุมัติและให้สถานะเป็น `approved`

2. ตั้งสิทธิ์ SKU ต่อแผนก  
หน้า: `/production-line/settings/department-products`
- ผูกว่า SKU ไหนเป็นของแผนก A/B
- ผูก QA แต่ละคนให้แก้ได้เฉพาะแผนกตัวเอง

3. ตั้งเจ้าของวัตถุดิบ  
หน้า: `/production-line/settings/material-owners`
- ผูก owner ของ RAW SKU ให้ครบ
- ปัจจุบันเป็นแบบ `1 SKU = 1 Owner Department`

4. ตรวจความพร้อมวัตถุดิบจริง  
ต้นทาง ERP/Gateway:
- Stock
- Open PO ETA
- Lead time / min-max

## 6) Flow เทสเต็มหลังตั้งค่าเสร็จ

1. วางแผนหลัก (รองผู้จัดการ)  
หน้า: `/production-line/planning/master`
- สร้าง Master Plan No เช่น `MP-2026-W08-001`
- ใส่แผนผลิตรายวันทั้งสัปดาห์
- Publish

2. QA ทำแผนย่อย  
หน้า: `/production-line/planning/inbox` และ `/production-line/planning/plan`
- QA A/B เปิด Plan No เดียวกัน
- แต่ละคนแก้ได้เฉพาะ scope ตัวเอง
- คำนวณวัตถุดิบ

3. ตรวจผลคำนวณ  
API/UI คำนวณ: `/api/production-planning/calculate`
- ระบบดู BOM explosion + stock + open PO ETA + lead time
- เคสไม่พอต้องเห็น short/backorder/ETA

4. สร้างแผน WIP draft (ถ้าต้องแตก WIP เพิ่ม)  
API: `/api/production-planning/wip-plan/draft`

5. Export ใบเบิก  
API: `/api/production-planning/requisition/export`
- ได้เลขใบเบิกสำหรับ import ERP (ไม่ใช่ Plan No)
- เลือกรูปแบบเบิก weekly หรือ daily ได้

6. ติดตามผล  
หน้า:
- `/production-line/planning/control-tower`
- `/production-line/planning/trace`
- `/production-line/planning/report`
- `/raw-material-requisitions/requisition`

## 7) Checklist ข้อมูลที่ต้องเตรียมเองก่อนกด TestSprite
- SKU จริงที่ต้องการเทส (FG/WIP/RAW) พร้อมหน่วยฐาน
- Stock snapshot ของวันเริ่มเทส
- Open PO ETA ของ SKU ที่อยากทดสอบกรณีขาด
- Lead time/min-max อย่างน้อย SKU สำคัญ
- Mapping รหัสซื้อขายที่จะใช้ตอน import ERP
- รายชื่อบัญชี UAT + role ครบ 5 บทบาท

## 8) จุดสำคัญไม่ให้เทสพัง
- BOM ต้อง approved ก่อน ไม่งั้นคำนวณ fail
- ต้องผูก department-products และ material-owners ให้ครบก่อน QA เริ่ม
- ถ้าจะเทสสิทธิ์ 403 ต้องแยก user คนละแผนกจริง
- เอกสาร ERP ใช้เลขใบเบิกจากระบบเรา ไม่ใช่ Plan No

## 9) ถ้าต้องการให้ผมทำต่อทันที
ผมทำให้ได้ 2 แบบ:
1. ทำไฟล์ seed SQL ชุด UAT นี้ให้ import ครั้งเดียว
2. ทำ TestSprite test plan แยกตาม role (Manager/QA/Viewer/Exception) พร้อม expected result ราย step
