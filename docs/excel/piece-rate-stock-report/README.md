# Excel รายงานรับเข้า WIP

ไฟล์อ่านรายงานผ่าน HTTPS API โดยไม่ถาม username/password ของผู้ใช้ Excel ใช้ token เฉพาะรายงานรับเข้าใน Windows Credential Manager; token ไม่อยู่ในไฟล์ Excel และ API ยอมรับ token นี้เฉพาะ GET `report=inbound&format=csv` เท่านั้น

## การใช้งาน

1. เปิดไฟล์และกด `Enable Content` เฉพาะไฟล์ที่ได้รับจากผู้ดูแลระบบ
2. ระบุ URL ระบบและช่วงวันที่
3. กด `ดึงรายงาน` ได้ทันทีหลังผู้ดูแลติดตั้ง token บนเครื่อง

ถ้าเครื่องยังไม่มี token ไฟล์จะแจ้งให้ติดต่อผู้ดูแล ไม่มีทาง fallback ไปถาม username/password

## ติดตั้งโดยผู้ดูแลระบบ

1. รัน `node scripts/create-piece-rate-inbound-excel-token.mjs` หนึ่งครั้งในพื้นที่ปลอดภัย เก็บ Token เป็นความลับ
2. ตั้งค่า env ฝั่งแอป `KPF_INBOUND_EXCEL_TOKEN_SHA256` เป็นค่า hash ที่สคริปต์แสดง แล้ว deploy แอป
3. บนเครื่องผู้ใช้ ภายใต้บัญชี Windows ที่ใช้เปิด Excel ไปที่ Control Panel > Credential Manager > Windows Credentials > Add a generic credential
4. ตั้ง Internet or network address เป็น `KPF-Piece-Rate-Inbound-Excel`, User name เป็น `report`, Password เป็น Token (ไม่ใช่ค่า hash)
5. ทดลองกดดึงรายงานจาก Excel และตรวจว่าคืน CSV; ถ้าต้องยกเลิกสิทธิ์ ให้เปลี่ยน Token และ hash ฝั่ง server แล้วติดตั้งใหม่บนเครื่องที่อนุญาต

Token นี้แชร์ระหว่างเครื่องที่ติดตั้ง จึงยกเลิกได้พร้อมกันทั้งหมด แต่ยังแยกยกเลิกรายเครื่องไม่ได้ ห้ามส่ง Token ไปพร้อมไฟล์ Excel

## นำโค้ดไปใช้กับไฟล์อื่น

นำเข้า `RefreshPieceRateInbound.bas` และ `JsonConverter.bas` ผ่าน VBA Editor (`Alt+F11` > Import File) เพิ่ม reference `Microsoft Scripting Runtime` แล้วกำหนดปุ่มให้เรียก macro `KpfPieceRateReport.RefreshPieceRateInbound` ไฟล์ปลายทางต้องมีชีตรายงานเป็นชีตแรกและใช้เซลล์ดังนี้:

- `B4`: HTTPS base URL
- `B5`: วันที่เริ่ม
- `D5`: วันที่สิ้นสุด
- `F5`: สถานะ
- `A8`: จุดเริ่มตารางผลลัพธ์

ฝั่งระบบต้องรองรับ `GET /api/attendance/piece-rate/stock/movements?report=inbound&format=csv&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
