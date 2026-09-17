# TestSprite UAT Flow: Owner Scope + Planning Calculate (Stock/PO)

วันที่เอกสาร: 2026-02-16  
สถานะ: Active  
ขอบเขตจริงรอบนี้: โหมด `Material Owner = Default Owner ต่อ SKU เท่านั้น` (ไม่มี Trade Override)

## 1) เป้าหมายการทดสอบ
- ยืนยันว่า setting owner วัตถุดิบใช้งานได้จริงและไม่ซ้ำ owner ต่อ SKU
- ยืนยันว่า flow วางแผน -> คำนวณวัตถุดิบ -> policy status ทำงานตรงตาม scope
- ยืนยันกติกา permission/owner scope/masterPlanNo ที่ endpoint สำคัญ
- ยืนยันความเข้าใจเรื่องการคำนวณว่าใช้ Stock และ Open PO อย่างไร

## 2) คำตอบสั้นเรื่องคำนวณ: ดูจาก Stock / PO ไหม
- `ดูจาก Stock`: ใช่
- `ดูจาก PO`: ใช่ (ใช้ Open PO ETA เพื่อประเมินวันพร้อมวัตถุดิบและสถานะ)
- จุดที่ระบบใช้จริง:
1. ดึง stock จาก `gateway:/api/raw-materials-summary-by-skus`
2. ดึง min/max/lead time จาก `gateway:/api/sku-min-max-by-sku`
3. ดึง open PO จาก `gateway:/api/open-po-eta-by-sku`
4. หักยอดเบิกแล้วด้วย `applyStockDeduction` (อ่าน `vw_issued_materials`)
- เงื่อนไขสำคัญ:
1. ถ้าเรียก `POST /api/production-planning/calculate` พร้อม `stockData` และ `minMaxData` ใน payload ระบบจะใช้ค่าที่ส่งมาแทนการดึง gateway สำหรับ 2 ตัวนี้
2. ในโหมดส่งข้อมูลเองนี้ ระบบตั้ง `poRows=[]` (จึงไม่มีการใช้ Open PO จาก gateway รอบนั้น)

อ้างอิงโค้ด:
- `src/features/production-planning/services/calculationLogic.js`
- `src/lib/stockDeduction.js`
- `src/app/api/production-planning/calculate/route.js`

## 3) ผู้ทดสอบ (แนะนำ)
- `UAT_PLN_MGR` (รองผู้จัดการ/วางแผนหลัก)
- `UAT_QA_DEPT_A` (QA แผนก A, editor)
- `UAT_QA_DEPT_B` (QA แผนก B, editor)
- `UAT_VIEWER` (ดูอย่างเดียว)
- `UAT_EXCEPTION_MGR` (ดู control tower / exception)

## 4) หน้าใช้งานที่ต้องใช้ในการเทส
- `/admin/products/trade-codes` (อ้างอิงรหัสซื้อขาย)
- `/production-line/bom` (ตั้ง BOM สูตร)
- `/production-line/settings/department-products` (ผูกสิทธิ์ SKU ที่แผนกแก้ได้)
- `/production-line/settings/material-owners` (ตั้ง owner วัตถุดิบแบบ Default ต่อ SKU)
- `/production-line/planning/master` (วางแผนและคำนวณ)
- `/raw-material-requisitions/requisition` (ตรวจเอกสารใบเบิกหลัง export/import)

## 5) ข้อมูลตั้งต้นที่ต้องเตรียม
- มี SKU FG อย่างน้อย 1 ตัว, WIP อย่างน้อย 1 ตัว, RAW อย่างน้อย 3 ตัว
- มี BOM ที่อนุมัติแล้ว (approved) สำหรับ FG/WIP ที่จะใช้เทส
- มี owner วัตถุดิบครบทุก SKU สำคัญในหน้า material-owners
- มีผู้ใช้ UAT ผูก role และแผนกครบ
- มี stock จริงใน ERP อย่างน้อยบาง SKU และมี SKU ที่ stock ไม่พอเพื่อเทส shortage
- มี Open PO ETA อย่างน้อย 1 SKU เพื่อเทส ETA จาก PO
- มีเลขแผน `masterPlanNo` ที่ format ถูกต้อง เช่น `MP-2026-W08-001`

## 6) Test Cases แบบ End-to-End

### TC-SETUP-001 ตั้ง owner วัตถุดิบแบบ Default ต่อ SKU
ผู้ทดสอบ: `UAT_PLN_MGR`  
ขั้นตอน:
1. เข้า `/production-line/settings/material-owners`
2. เลือกแผนก A
3. ค้นหาและติ๊ก SKU วัตถุดิบ 2-3 รายการ
4. กด `กำหนด Owner`
5. สลับไปแผนก B และลองโอน owner ของ SKU เดิมไป B
ผลที่คาดหวัง:
1. 1 SKU มี owner ได้เพียง 1 แผนก
2. เมื่อโอน owner แล้ว รายการย้ายฝั่งแผนกทันที
3. ไม่มีส่วน Trade Override ให้ผู้ใช้สับสน

### TC-SCOPE-001 จำกัดสิทธิ์ QA ตามแผนกเจ้าของ SKU
ผู้ทดสอบ: `UAT_QA_DEPT_A`, `UAT_QA_DEPT_B`  
ขั้นตอน:
1. ให้ QA A เรียกคำนวณแผนที่มี SKU ของ A และ B ปนกัน
2. ให้ QA B ทำแบบเดียวกัน
ผลที่คาดหวัง:
1. ถ้ามี SKU นอก scope ต้องโดน `403 Department scope violation`
2. ถ้า SKU อยู่ใน scope ทั้งหมด จึงคำนวณผ่าน

### TC-PLANNO-001 บังคับ masterPlanNo ตอนคำนวณ
ผู้ทดสอบ: `UAT_QA_DEPT_A`  
ขั้นตอน:
1. เรียก `POST /api/production-planning/calculate` โดยไม่ส่ง `masterPlanNo`
2. เรียกอีกครั้งโดยส่ง `masterPlanNo` format ผิด
3. เรียกอีกครั้งโดยส่ง `masterPlanNo` ถูก แต่ plannedItems บางแถวระบุแผนไม่ตรง
ผลที่คาดหวัง:
1. กรณี 1 = `400 masterPlanNo is required`
2. กรณี 2 = `400 Invalid masterPlanNo format`
3. กรณี 3 = `400 Plan No mismatch in plannedItems`

### TC-CALC-STOCK-001 Stock พอทั้งหมด
ผู้ทดสอบ: `UAT_PLN_MGR`  
ขั้นตอน:
1. เตรียม plannedItems ที่วัตถุดิบทุกตัว stock หลังหัก issued แล้วยังพอ
2. เรียก `POST /api/production-planning/calculate`
ผลที่คาดหวัง:
1. `items[].status` ของวัตถุดิบ = `available`
2. `planSummaries[].policyStatus` = `ready`
3. `earliestMaterialEta` เป็น `null`

### TC-CALC-PO-001 Stock ไม่พอ แต่มี Open PO
ผู้ทดสอบ: `UAT_PLN_MGR`  
ขั้นตอน:
1. เตรียม plannedItems ให้บางวัตถุดิบ shortage
2. SKU shortage มี Open PO พร้อม ETA
3. เรียกคำนวณ
ผลที่คาดหวัง:
1. `items[].status` ของ SKU shortage เป็น `late-availability` หรือ `shortage` ตามข้อมูล
2. มี `etaDate` จาก Open PO
3. `planSummaries` ของแผนที่โดนกระทบมี `earliestMaterialEta`
4. `policyStatus` เปลี่ยนเป็น `partial` หรือ `backorder/blocked` ตามระดับ shortage

### TC-CALC-LEADTIME-001 Stock ไม่พอและไม่มี Open PO
ผู้ทดสอบ: `UAT_PLN_MGR`  
ขั้นตอน:
1. เตรียม SKU shortage ที่ไม่มี Open PO
2. มีค่า lead time ใน sku-min-max
3. เรียกคำนวณ
ผลที่คาดหวัง:
1. ระบบคำนวณ ETA จาก lead time (`leadTime + buffer 2 วัน`)
2. ถ้า resolve ETA ไม่ได้ อาจลงสถานะขาดแบบหนักขึ้น (เช่น blocked)

### TC-CALC-OVERRIDE-INPUT-001 ส่ง stockData/minMaxData เอง
ผู้ทดสอบ: `UAT_PLN_MGR`  
ขั้นตอน:
1. เรียก `POST /api/production-planning/calculate` พร้อม `stockData` + `minMaxData`
2. ใส่ข้อมูลจำลองที่ต่างจาก gateway
ผลที่คาดหวัง:
1. ระบบใช้ข้อมูลที่ส่งมาเป็นหลัก
2. รอบนี้ไม่ใช้ `poRows` จาก gateway (ตามโค้ดปัจจุบัน)
3. ผลลัพธ์ต้องสัมพันธ์กับข้อมูลจำลองที่ส่งมา

### TC-REQ-TRACE-001 ติดตามจากแผนไปใบเบิก
ผู้ทดสอบ: `UAT_PLN_MGR` + `UAT_QA_DEPT_A`  
ขั้นตอน:
1. วางแผนและคำนวณเสร็จ
2. ดำเนิน flow export ใบเบิกตามระบบ
3. ตรวจรายการใน `/raw-material-requisitions/requisition`
ผลที่คาดหวัง:
1. ใบเบิกอ้างอิงแผนได้ (traceable)
2. การแยกชุดวัสดุสอดคล้อง owner mapping ที่ตั้งไว้

## 7) API Payload ตัวอย่างสำหรับ TestSprite

### 7.1 ตัวอย่าง calculate (happy path)
```json
{
  "masterPlanNo": "MP-2026-W08-001",
  "plannedItems": [
    {
      "id": "PLAN-001",
      "masterPlanNo": "MP-2026-W08-001",
      "skuCode": "FG-0001",
      "skuName": "สินค้า FG ตัวอย่าง",
      "quantity": 120,
      "date": "2026-02-17"
    }
  ]
}
```

### 7.2 ตัวอย่าง calculate พร้อม stockData/minMaxData จำลอง
```json
{
  "masterPlanNo": "MP-2026-W08-001",
  "plannedItems": [
    {
      "id": "PLAN-002",
      "masterPlanNo": "MP-2026-W08-001",
      "skuCode": "FG-0001",
      "quantity": 80,
      "date": "2026-02-18"
    }
  ],
  "stockData": [
    { "SKU_CODE": "RM-0001", "SKU_NAME": "แป้ง", "UTQ_NAME": "KG", "QTY": 50 }
  ],
  "minMaxData": [
    { "SKU_CODE": "RM-0001", "SKU_LEAD_TIME": "3" }
  ]
}
```

## 8) Checklist สรุปก่อนปิด UAT
- [ ] ตั้ง owner วัตถุดิบครบ และไม่ซ้ำ owner ต่อ SKU
- [ ] QA แต่ละแผนกคำนวณได้เฉพาะ SKU ใน scope
- [ ] ทุก calculate บังคับ `masterPlanNo` ถูกต้อง
- [ ] กรณี stock พอ => `ready`
- [ ] กรณี stock ไม่พอ + มี PO => มี ETA จาก PO
- [ ] กรณี stock ไม่พอ + ไม่มี PO => fallback ตาม lead time
- [ ] ผลลัพธ์ `planSummaries` และ `items` ตรงกับข้อมูลตั้งต้น
- [ ] มีหลักฐานภาพหน้าจอ/response JSON ต่อ test case

## 9) หมายเหตุสำคัญให้ทีมเทส
- หน้า `material-owners` ปัจจุบันเป็นโหมดง่าย: Default Owner ต่อ SKU เท่านั้น
- การเลือกรหัสซื้อขายสำหรับเบิก ให้ทดสอบใน flow ใบเบิก (ไม่ใช่หน้า owner)
- เลขเอกสารที่ import เข้า ERP ต้องเป็นเลขใบเบิกของระบบ (`Requisition No`) ไม่ใช่ `Plan No`
