# Local Serial Scale Receiving Design

## Goal

เพิ่มหน้ารับเข้าผลิตภัณฑ์จากเครื่องชั่ง OHAUS Defender 3000 ผ่าน USB-to-RS232 โดยอ่านน้ำหนักแบบเรียลไทม์ บันทึกเข้าระบบรับเข้าเดิม และพิมพ์ฉลากบาร์โค้ดแบบเดียวกับหน้าชั่งเข้าปัจจุบัน

## Approved User Flow

1. ผู้ใช้เปิดหน้า “ชั่งน้ำหนักจากเครื่องชั่ง”
2. เลือกสินค้า
3. เลือก LOT เดิมหรือพิมพ์ LOT ใหม่
4. ระบุน้ำหนักภาชนะ
5. หน้าเว็บรับน้ำหนักรวมจาก `local-scale-agent` แบบเรียลไทม์
6. ระบบคำนวณน้ำหนักสุทธิและตรวจค่านิ่ง
7. เมื่อข้อมูลครบและค่านิ่ง ผู้ใช้กดบันทึก
8. Server บันทึกใบรับเข้าและสร้างเลขบาร์โค้ดด้วย logic เดิม
9. หน้าเว็บใช้ receipt ที่ Server ส่งกลับมาสร้าง payload ฉลากผ่าน helper กลางเดียวกับหน้าชั่งเข้า
10. `local-print-agent` เดิมพิมพ์ฉลาก 80 × 50 มม. แบบ CODE128
11. ตารางด้านล่างแสดง 20 รายการล่าสุดและพิมพ์ซ้ำด้วย barcode เดิมได้

## Architecture

### Scale transport

- `local-scale-agent` ทำงานที่ `127.0.0.1:41952`
- เปิด COM port ด้วย `serialport`
- REST: `/health`, `/ports`, `/config/serial`
- WebSocket: `/stream`
- Agent ไม่บันทึก Supabase และไม่สั่งเครื่องพิมพ์

### Receiving and barcode

- หน้าใหม่ใช้ `saveScaleReceipt()` เหมือนหน้าชั่งเข้า
- เลขบาร์โค้ดสร้างที่ Server จาก `src/lib/scale/receipts.js`
- ห้ามสร้างเลขบาร์โค้ดใน browser หรือ Scale Agent
- `buildWeightScaleReceiptPrintLabel()` เป็นสัญญากลางของหน้าชั่งเข้ากับหน้าใหม่
- พิมพ์ผ่าน `printWeightScaleLabelViaAgent()` และ bitmap renderer เดิม
- การพิมพ์ล้มเหลวต้องไม่สร้าง receipt ซ้ำ ผู้ใช้พิมพ์ซ้ำจาก receipt เดิมได้

## Performance

- Server Component โหลดสินค้า LOT และ 20 รายการล่าสุดพร้อมกันเท่าที่ dependency อนุญาต
- Client Component รับเฉพาะ plain serializable initial payload
- WebSocket มีหนึ่ง connection ต่อหน้าและ reconnect ด้วย timer เดียว
- เก็บ raw log สูงสุด 10 รายการและ recent receipts สูงสุด 20 รายการ
- ไม่ใช้ chart library, animation loop, backdrop blur หรือพื้นหลังตกแต่งที่ต้อง repaint ต่อเนื่อง
- อัปเดตเฉพาะค่าที่อ่านได้ ไม่ polling Supabase ตามทุก serial frame

## UI

- ใช้ Sidebar ของระบบเดิม
- Navy `#102C57`, Gold `#D4AF37`, พื้นขาว/เทาอ่อน
- ตัวเลขน้ำหนักเป็น visual focus
- ตารางคงรูปแบบ table และเลื่อนแนวนอนบนจอแคบ
- สถานะ connected, stable, saved และ print failure ใช้ทั้งข้อความและสี
- ข้อความภาษาไทยเป็น UTF-8 และห้ามมี Mojibake

## Error Handling

- Agent ไม่ทำงาน: แสดงสถานะออฟไลน์และปิดปุ่มบันทึก
- COM port ปิด: แสดงสาเหตุจาก `/health`
- Frame อ่านไม่ได้: เก็บ raw line สำหรับวิเคราะห์ แต่ไม่เปิดปุ่มบันทึก
- ค่าน้ำหนักไม่นิ่ง: ปิดปุ่มบันทึก
- บันทึกล้มเหลว: ไม่พิมพ์
- บันทึกสำเร็จแต่พิมพ์ล้มเหลว: แสดง warning และเปิดให้พิมพ์ซ้ำ

## Verification

- Parser tests สำหรับ Defender frames, invalid frames และ serial config
- Contract tests ยืนยันว่าหน้าชั่งเข้ากับหน้าใหม่ใช้ label builder เดียวกัน
- Source regression tests สำหรับ route, Sidebar, limit 20, reprint และ save-before-print
- ESLint, production build และ Mojibake scan

