# Piece Rate Trade Code UAT Checklist

วันที่: 2026-03-12

เอกสารนี้ใช้สำหรับทดสอบ UAT หลังเปลี่ยนระบบ `piece-rate` ให้รองรับ `Trade Code` แทนการอิง `SKU barcode` แบบเดิม โดยยังคงไม่แตะ flow การชั่งน้ำหนักจากเครื่องชั่ง

## ขอบเขตที่ต้องผ่าน

- หน้าตั้งค่า `Piece Rate` ต้องผูก `Trade Code -> Profile` ได้
- หน้าบันทึกคิดค่าแรงต้องสแกน barcode แล้ว resolve เป็น `Trade Code` ได้
- ต้องแสดง `Trade Code` และ `SKU` ได้ทั้งหน้า scan, slip, และ report
- ต้องรองรับ online และ offline
- ถ้าเป็นช่วงเปลี่ยนผ่าน ต้อง fallback ของเดิมได้ในเคสที่ยังใช้ legacy barcode

## ข้อกำหนดก่อนเริ่ม

1. Apply migration [20260311_add_trade_code_support_to_piece_rate.sql](/C:/Users/Riew/Desktop/KPF/Production-Line/Production-Line/supabase/migrations/20260311_add_trade_code_support_to_piece_rate.sql) แล้ว
2. มีข้อมูลใน table `pallet_trade_code_barcodes`
3. มีข้อมูลตั้งค่า `Trade Code` อย่างน้อย 3 กรณี
4. มี user ที่มีสิทธิ์เข้า settings และ attendance
5. ถ้าใช้ `SUNMI V3` ให้ตรวจว่า scanner ใช้งานได้

## ชุดข้อมูลที่ควรเตรียม

1. 1 รายการที่ผูก profile แบบ `kg`
2. 1 รายการที่ผูก profile แบบ `pail`
3. 1 รายการที่มี barcode แต่ยังไม่ผูก profile
4. 1 รายการที่ไม่มี barcode mapping เพื่อใช้ทดสอบ error
5. พนักงานอย่างน้อย 2 คนที่สแกนได้จริง

## A. UAT หน้าตั้งค่า Piece Rate

1. เปิดหน้า `/production-line/settings/piece-rate`
   คาดหวัง: หน้าเปิดได้ปกติ และตารางแสดง `Trade Code`, `SKU`, ชื่อสินค้า, แบรนด์, หน่วย

2. ค้นหาด้วย `Trade Code`
   คาดหวัง: พบรายการที่ตรง

3. ค้นหาด้วย `SKU`
   คาดหวัง: พบรายการเดิม

4. ค้นหาด้วยชื่อสินค้า
   คาดหวัง: พบรายการเดิม

5. เลือก profile ให้รายการแบบ `kg`
   คาดหวัง: เลือกได้และไม่มี error

6. เลือก profile ให้รายการแบบ `pail`
   คาดหวัง: เลือกน้ำหนักมาตรฐานได้

7. กดบันทึก
   คาดหวัง: บันทึกสำเร็จ และไม่มี validation error

8. รีเฟรชหน้า
   คาดหวัง: mapping ยังอยู่ครบ

## B. UAT บันทึกคิดค่าแรงแบบ Online

1. เปิดหน้า `/production-line/attendance/piece-rate-scan`
   คาดหวัง: หน้าเปิดได้ปกติ

2. สแกน barcode สินค้าที่ผูก `Trade Code`
   คาดหวัง: ระบบ resolve สินค้าได้

3. ตรวจกล่องข้อมูลสินค้า
   คาดหวัง:
   - แสดง `Trade Code` เป็นรหัสหลัก
   - แสดง `SKU` เพิ่มเติม
   - แสดงชื่อสินค้า, แบรนด์, profile ถูกต้อง

4. สแกน QR พนักงาน
   คาดหวัง: ระบบพบพนักงานและเปิด form บันทึก

5. ทดสอบรายการแบบ `kg`
   คาดหวัง: กรอกตาม flow เดิมและบันทึกสำเร็จ

6. ทดสอบรายการแบบ `pail`
   คาดหวัง: ใช้น้ำหนักมาตรฐานตาม profile ที่ตั้งไว้ และบันทึกสำเร็จ

7. ถ้ามีพิมพ์ slip หลังบันทึก
   คาดหวัง:
   - slip แสดง `Trade Code`
   - ถ้ามี `SKU` ให้แสดงร่วมกันได้
   - เลขเอกสารออกตาม server ตามปกติ

## C. UAT รายงาน

1. เปิดหน้า `/production-line/attendance/report/piece-rate`
   คาดหวัง: หน้าโหลดได้ปกติ

2. ตรวจรายการที่เพิ่งบันทึก
   คาดหวัง:
   - แสดง `Trade Code`
   - แสดง `SKU`
   - แสดงชื่อสินค้า, แบรนด์, พนักงาน ถูกต้อง

3. ค้นหาด้วย `Trade Code`
   คาดหวัง: เจอรายการ

4. ค้นหาด้วย `SKU`
   คาดหวัง: เจอรายการเดิม

5. ค้นหาด้วยชื่อสินค้า
   คาดหวัง: เจอรายการเดิม

## D. UAT Offline

1. ขณะออนไลน์ เปิดหน้า `/production-line/attendance/piece-rate-scan`
2. กด sync master data ให้พร้อม
   คาดหวัง: readiness พร้อมใช้งาน offline

3. ปิดอินเทอร์เน็ต
4. สแกนสินค้าแบบ `Trade Code barcode`
   คาดหวัง: resolve ได้จาก local master

5. สแกนพนักงาน
   คาดหวัง: resolve ได้จาก local master

6. บันทึก 2 รายการ
   คาดหวัง:
   - บันทึกลง queue ในเครื่อง
   - ยังไม่มีเลขเอกสารจริงทันที

7. เปิดอินเทอร์เน็ตกลับ
   คาดหวัง:
   - queue sync อัตโนมัติ
   - รายการเปลี่ยนสถานะเป็น synced/ready to print ตาม flow เดิม

8. ตรวจ report
   คาดหวัง: รายการที่บันทึก offline ปรากฏใน report พร้อม `Trade Code`

## E. UAT กรณี Error

1. สแกน barcode ที่มี mapping barcode แต่ยังไม่ผูก profile
   คาดหวัง: ระบบแจ้งว่า product ยังไม่ mapped กับ piece-rate profile

2. สแกน barcode ที่ไม่มี mapping เลย
   คาดหวัง: ระบบแจ้งว่าไม่พบบาร์โค้ดสินค้า

3. บันทึกตอน offline แล้วกลับมา online
   คาดหวัง: ถ้า sync ไม่ผ่าน รายการต้องไป `Failed` หรือ `Needs Review` ไม่หายเงียบ

4. กด retry queue
   คาดหวัง: รายการ retry ได้

## F. UAT ช่วงเปลี่ยนผ่าน

1. สแกนสินค้าที่มีเฉพาะ legacy barcode mapping
   คาดหวัง: ระบบยัง fallback ได้ตามที่ออกแบบไว้

2. สแกนสินค้าที่มีทั้ง legacy barcode และ trade code barcode
   คาดหวัง: ระบบต้องเลือก `Trade Code` ก่อน และผลลัพธ์ต้องไม่ผิดสินค้า

## จุดที่ต้องติ๊กผ่านก่อนขึ้นใช้งานจริง

- ตั้งค่า profile ด้วย `Trade Code` ได้
- scan แล้ว resolve เป็น `Trade Code` ถูกต้อง
- แสดง `SKU` ร่วมได้
- บันทึก online ได้
- บันทึก offline แล้ว sync กลับได้
- report ค้นหาด้วย `Trade Code` และ `SKU` ได้
- ไม่กระทบ flow ชั่งน้ำหนักเดิม

## ผลการทดสอบ

| รายการ | ผลลัพธ์ | หมายเหตุ |
|---|---|---|
| A. ตั้งค่า Piece Rate | Pending |  |
| B. บันทึกคิดค่าแรง Online | Pending |  |
| C. รายงาน | Pending |  |
| D. Offline | Pending |  |
| E. Error Cases | Pending |  |
| F. ช่วงเปลี่ยนผ่าน | Pending |  |

## Sign-off

- ผู้ทดสอบ:
- วันที่ทดสอบ:
- ผลสรุป:
- หมายเหตุเพิ่มเติม:
