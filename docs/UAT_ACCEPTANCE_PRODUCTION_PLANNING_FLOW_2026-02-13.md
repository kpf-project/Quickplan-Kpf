# UAT Acceptance: Production Planning Flow

วันที่: 2026-02-13  
อ้างอิงสเปก: `docs/PRODUCTION_PLANNING_MIXED_BOM_SYSTEM_SPEC_2026-02-12.md`

## 1) เป้าหมาย UAT
- ยืนยันว่า flow หลักใช้งานได้ครบเส้น: `Publish -> Workbench -> Control Tower -> Replan -> Trace`
- ยืนยันสิทธิ์การใช้งานตามบทบาท `manager / editor / viewer`
- ยืนยันว่าผลคำนวณแสดงผลหน้างานชัดเจน (feasible/short/backorder/ETA/exception)

## 2) ข้อมูลทดสอบขั้นต่ำ
- มี `Master Plan No` อย่างน้อย 1 แผน และมีรายการ MAIN/SUB
- มี SKU อย่างน้อย 1 รายการที่เกิด shortage/ETA เลท เพื่อให้เกิด replan จริง
- มีข้อมูลแผนกอย่างน้อย 2 แผนก เพื่อทดสอบ cross-department view
- มีผู้ใช้ทดสอบ 3 บทบาท: manager, editor, viewer

## 3) Test Flow Checklist (End-to-End)
1. `Publish (Manager)`
- เปิดหน้า `master` และสร้างแผนหลักด้วย Plan No
- กด `เผยแพร่แผนหลัก`
- คาดหวัง:
  - มีสถานะ publish สำเร็จ
  - แผนถูกส่งต่อไป Workbench/Inbox

2. `Workbench (Editor ของแผนกเจ้าของ)`
- เปิดหน้า `plan` หรือ `inbox` ด้วย Plan No เดียวกัน
- เห็นงานแผนกตัวเองแบบแก้ไขได้ และงานแผนกอื่นเป็น read-only
- กดคำนวณ และตรวจค่า:
  - `ผลิตได้จริง`
  - `ขาดผลิต`
  - `ค้างผลิต`
  - `ETA`
  - `สาเหตุ`
- คาดหวัง:
  - editor แก้ได้เฉพาะ scope ตัวเอง
  - viewer ไม่สามารถแก้ไข

3. `Control Tower (Manager / Warehouse / Purchasing)`
- เปิดหน้า `control-tower`
- ตรวจผลรวมรายวัน รายแผนก และรายการแผนที่ล่าช้า
- คาดหวัง:
  - เห็นผลกระทบข้ามแผนก
  - เห็น net gap และ ETA impact ชัดเจน

4. `Replan`
- จากหน้า report/expired/control-tower กดปุ่ม `Replan`
- คาดหวัง:
  - ระบบสร้าง/อัปเดตงาน replan สำเร็จ
  - แผนที่ได้รับผลกระทบมีสถานะ/ตัวเลขอัปเดตตาม ETA ล่าสุด

5. `Trace`
- กด `Trace` จากรายการที่ replan แล้ว
- คาดหวัง:
  - เห็นความเชื่อมโยง `main -> sub -> material impact + exception reason`
  - ตรวจย้อนกลับได้ว่าแผนใดได้รับผลจาก shortage/ETA เลท

## 4) Role-based Acceptance Matrix
| กรณี | manager | editor | viewer | ผลที่คาดหวัง |
|---|---|---|---|---|
| เปิดดู master/plan/report/expired/control-tower/trace | ผ่าน | ผ่าน | ผ่าน | ทุกบทบาทเห็นข้อมูลรวมได้ |
| Publish Master Plan | ผ่าน | ไม่ผ่าน | ไม่ผ่าน | จำกัดเฉพาะสิทธิ์บริหาร |
| Calculate/Replan ใน scope แผนก | ผ่าน | ผ่าน (เฉพาะ own scope) | ไม่ผ่าน | role lock ถูกต้อง |
| แก้ไขจำนวนผลิตในแถวงาน | ผ่าน | ผ่าน (เฉพาะ own scope) | ไม่ผ่าน | local ownership ถูกต้อง |
| ดู trace และเหตุผล exception | ผ่าน | ผ่าน | ผ่าน | มองเห็น root-cause ได้ |

## 5) UX Acceptance (หน้างาน)
- ภาษาหน้าจอเป็นไทย เข้าใจง่าย (เมนู/ฟิลเตอร์/สถานะ/ข้อความเตือน)
- ใน report/expired ต้องเห็น:
  - สาเหตุ (shortage/ETA เลท/reschedule)
  - ตัวเลขวัตถุดิบที่ต้องใช้เทียบกับที่เบิกได้
  - ปุ่มลัด `Replan` และ `Trace` ต่อรายการ
- ใน control-tower ต้องเห็น:
  - แผนล่าช้า, backorder, net gap
  - รายการที่ต้องลงมือก่อน (priority/action)

## 6) หลักฐานที่ต้องเก็บตอน UAT
- Screenshot แต่ละขั้น: publish, workbench, control-tower, replan, trace
- ตัวอย่าง Plan No ที่ใช้ทดสอบ
- รายชื่อผู้ทดสอบและบทบาท
- ผลลัพธ์ PASS/FAIL ต่อ checklist
- กรณี FAIL: แนบ root cause + ลิงก์ issue ที่เปิดแก้ไข

## 7) สรุปผลรอบ UAT (Template)
- วันที่ทดสอบ:
- Environment:
- Plan No ที่ใช้:
- PASS:
- FAIL:
- ความเสี่ยงคงค้าง:
- ข้อเสนอแนะก่อน Go-live:
