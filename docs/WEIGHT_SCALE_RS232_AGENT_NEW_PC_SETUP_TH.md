# คู่มือติดตั้ง Weight Scale RS232 Agent สำหรับคอมพิวเตอร์เครื่องใหม่

คู่มือนี้ใช้สำหรับคอมพิวเตอร์ Windows ที่เปิดหน้า `/production-line/weight-scale` และรับน้ำหนักจากเครื่องชั่งผ่านสาย **RS232 → USB**

Agent สำหรับหน้าชั่งผลิตภัณฑ์ใช้ที่อยู่:

- REST: `http://127.0.0.1:41952`
- WebSocket: `ws://127.0.0.1:41952/stream`
- Windows Scheduled Task: `KPF Local Scale Agent`

> ห้ามติดตั้งด้วยโปรไฟล์ Piece Rate สำหรับงานนี้ เพราะ Piece Rate ใช้พอร์ต `41953` และไฟล์ตั้งค่าแยกกัน

## 1. สิ่งที่ต้องเตรียม

- คอมพิวเตอร์ Windows 10 หรือ Windows 11
- สิทธิ์ Administrator ของเครื่อง
- เครื่องชั่งและสาย RS232 → USB
- Driver ของสาย USB-to-Serial เช่น CH340/CH341 หรือ FTDI ตามชิปของสาย
- โฟลเดอร์ `local-scale-agent` จากระบบ Production Line
- อินเทอร์เน็ตสำหรับติดตั้ง Node.js/dependencies หรือชุดติดตั้งแบบ offline ที่มีไฟล์ครบแล้ว

## 2. ติดตั้ง Driver และตรวจสอบ COM Port

1. ติดตั้ง Driver ของสาย RS232 → USB ตามผู้ผลิต
2. ต่อสายเข้าคอมพิวเตอร์และเปิดเครื่องชั่ง
3. เปิด **Device Manager**
4. เปิดหัวข้อ **Ports (COM & LPT)**
5. จดหมายเลขพอร์ต เช่น `COM7`

ถ้าไม่พบหัวข้อ Ports หรือมีเครื่องหมายเตือนสีเหลือง ให้ติดตั้ง Driver ให้สำเร็จก่อนดำเนินการต่อ

## 3. ตั้งค่าเครื่องชั่ง

ตั้งค่า Serial/RS232 ที่หน้าจอเครื่องชั่งให้ตรงกับค่าที่จะใช้ในระบบ โดยค่าเริ่มต้นคือ:

| รายการ | ค่าเริ่มต้น |
| --- | --- |
| Baud rate | `9600` |
| Data bits | `8` |
| Parity | `none` |
| Stop bits | `1` |

ต้องเปิดโหมดส่งน้ำหนักออกทาง RS232 แบบต่อเนื่องหรือ Print Output ด้วย มิฉะนั้น Agent อาจเปิด COM ได้แต่ไม่มีค่าน้ำหนักส่งเข้าระบบ

## 4. วางโฟลเดอร์ Agent ไว้ตำแหน่งถาวร

1. คัดลอกโฟลเดอร์ `local-scale-agent` ทั้งโฟลเดอร์ไปยังคอมพิวเตอร์หน้างาน
2. แนะนำพาธถาวร เช่น:

   ```text
   C:\KPF\local-scale-agent
   ```

3. ห้ามย้าย เปลี่ยนชื่อ หรือลบโฟลเดอร์นี้หลังติดตั้ง เพราะ Scheduled Task จะจำพาธของสคริปต์ในตำแหน่งนี้

โฟลเดอร์ขั้นต่ำต้องมีไฟล์ต่อไปนี้:

```text
local-scale-agent\
  config.example.json
  install-workstation.cmd
  install-workstation.ps1
  install-task.ps1
  package.json
  package-lock.json
  run-agent-hidden.ps1
  scale-runtime-profile.js
  server.js
```

## 5. เตรียม Node.js และ dependencies

### กรณีชุดที่คัดลอกมามี `node_modules` ครบ

ข้ามไปขั้นตอนที่ 6 ได้ ตัวติดตั้งจะตรวจ Node.js และพยายามติดตั้ง Node.js LTS ผ่าน `winget` หากยังไม่มี

### กรณีไม่มีโฟลเดอร์ `node_modules`

1. เปิด PowerShell ในโฟลเดอร์ Agent
2. ตรวจ Node.js:

   ```powershell
   node --version
   npm --version
   ```

3. ถ้ายังไม่มี Node.js ให้ติดตั้ง Node.js LTS ก่อน หรือปล่อยให้ตัวติดตั้งในขั้นตอนที่ 6 ติดตั้งผ่าน `winget`
4. เมื่อติดตั้ง Node.js แล้ว ให้ติดตั้ง dependencies:

   ```powershell
   cd C:\KPF\local-scale-agent
   npm ci
   ```

ถ้าเครื่องไม่มีอินเทอร์เน็ต ให้เตรียมชุด Agent ที่มี `node_modules` และ native module สำหรับ Windows/สถาปัตยกรรมของเครื่องนั้นมาด้วย หรือวาง Portable Node ที่ `local-scale-agent\node\node.exe`

## 6. ติดตั้ง Agent ให้เริ่มพร้อม Windows

1. คลิกขวาไฟล์ `install-workstation.cmd`
2. เลือก **Run as administrator**
3. ตอบรับหน้าต่าง UAC
4. รอจนแสดงข้อความ:

   ```text
   KPF Local Scale Agent installation completed.
   ```

ตัวติดตั้งจะ:

1. สร้าง `config.json` จาก `config.example.json` หากยังไม่มี
2. ตรวจหา Node.js และติดตั้ง Node.js LTS ผ่าน `winget` หากจำเป็น
3. สร้าง Scheduled Task ชื่อ `KPF Local Scale Agent`
4. ตั้งให้ Agent เริ่มหลังผู้ใช้ Windows คนปัจจุบัน Sign in
5. เริ่ม Agent ทันที
6. ตรวจ Health ที่พอร์ต `41952`

> Scheduled Task ถูกผูกกับ Windows user ที่ใช้ติดตั้ง หากหน้างานเข้า Windows ด้วย user อื่น ให้ติดตั้งใหม่ภายใต้ user ที่ใช้งานจริง

## 7. ตรวจว่า Agent ทำงาน

เปิด Chrome หรือ Edge บนคอมพิวเตอร์หน้างาน แล้วเปิด:

```text
http://127.0.0.1:41952/health
```

ผลปกติควรเป็น JSON ที่มี:

```json
{
  "ok": true,
  "portOpen": false
}
```

`ok: true` หมายถึง Agent ทำงานแล้ว ส่วน `portOpen: false` ยังถือว่าปกติหากยังไม่ได้เลือก COM Port

ตรวจรายชื่อ COM ที่ Agent มองเห็นได้ที่:

```text
http://127.0.0.1:41952/ports
```

ควรพบพอร์ตที่จดจาก Device Manager เช่น `COM7`

## 8. ตั้งค่าในหน้าชั่งผลิตภัณฑ์

1. เปิด `/production-line/weight-scale`
2. เปิดเมนู **คอนฟิก**
3. ที่หัวข้อ **แหล่งอ่านน้ำหนัก** เลือก **RS232 → USB**
4. กด **รีเฟรชพอร์ต**
5. เลือก COM Port ที่ถูกต้อง เช่น `COM7`
6. ตั้ง Baud rate, Data bits, Parity และ Stop bits ให้ตรงกับเครื่องชั่ง
7. ตรวจช่อง **น้ำหนักทดสอบ Realtime**
8. กด **บันทึก**

เมื่อบันทึก Agent จะเขียนค่าไปที่ `local-scale-agent\config.json` และเปิด COM Port ใหม่อัตโนมัติ

## 9. ทดสอบการใช้งานจริง

1. กลับไปหน้าชั่งผลิตภัณฑ์
2. เลือกผลิตภัณฑ์และตรวจ LOT, น้ำหนักผ่าน และ TARE
3. วางน้ำหนักทดสอบบนเครื่องชั่ง
4. ตรวจว่าตัวเลขบนหน้าเว็บเปลี่ยนตามเครื่องชั่ง
5. รอให้น้ำหนักนิ่งและผ่านเกณฑ์
6. ตรวจว่าเกิดการบันทึกอัตโนมัติ ออกบาร์โค้ด บันทึกสต็อก และพิมพ์ฉลากตามขั้นตอนเดิม
7. ยกสินค้าออกและตรวจว่าน้ำหนักกลับใกล้ศูนย์ก่อนชั่งรายการถัดไป

ควรทดสอบอย่างน้อย 3 รายการและตรวจน้ำหนักสุทธิ/บาร์โค้ดกับรายการย้อนหลังทุกครั้งก่อนส่งมอบเครื่อง

## 10. ตรวจการเริ่มอัตโนมัติหลัง Restart

1. Restart คอมพิวเตอร์
2. Sign in ด้วย Windows user ที่ใช้ติดตั้ง
3. รอประมาณ 10–20 วินาที
4. เปิด `http://127.0.0.1:41952/health`
5. ตรวจว่า `ok` เป็น `true`
6. เปิดหน้าชั่งและทดลองอ่านน้ำหนักอีกครั้ง

สามารถตรวจ Scheduled Task ได้จาก **Task Scheduler → Task Scheduler Library → KPF Local Scale Agent**

## 11. ข้อควรระวังเรื่อง Piece Rate

- Weight Scale ใช้พอร์ต Agent `41952`
- Piece Rate/บันทึกเนื้อขนมป้ายแยมใช้พอร์ต Agent `41953`
- สอง Agent ใช้ไฟล์ config แยกกันและไม่ควรแก้สลับกัน
- **COM Port เดียวเปิดพร้อมกันโดยสองโปรแกรมไม่ได้** ถ้าคอมเครื่องเดียวรัน Agent ทั้ง `41952` และ `41953` และตั้งให้ใช้ COM เดียวกัน จะมีหนึ่ง Agent เปิดพอร์ตไม่สำเร็จ
- ถ้าต้องใช้เครื่องชั่งตัวเดียวสลับสองงานบนคอมเครื่องเดียว ต้องหยุด Agent ที่ไม่ได้ใช้งานก่อน หรือใช้เครื่องชั่ง/USB adapter แยกคนละ COM

## 12. แก้ปัญหาเบื้องต้น

### เปิด `41952/health` ไม่ได้

1. เปิด Task Scheduler และตรวจว่า `KPF Local Scale Agent` อยู่สถานะ Running
2. คลิกขวา Task แล้วเลือก Run
3. ตรวจว่าโฟลเดอร์ Agent ยังอยู่พาธเดิม
4. ตรวจ `node --version`
5. ตรวจว่าไม่มีโปรแกรมอื่นใช้พอร์ต TCP `41952`
6. รัน Agent แบบเห็นข้อความชั่วคราวเพื่อวิเคราะห์:

   ```powershell
   cd C:\KPF\local-scale-agent
   npm start
   ```

### `/ports` ไม่พบ COM

- ตรวจ Driver ใน Device Manager
- ถอดและเสียบ USB ใหม่
- ลองเปลี่ยนช่อง USB
- Restart เครื่องหลังติดตั้ง Driver

### `portOpen: false` หรือแจ้งว่า Access denied

- ปิดโปรแกรม Serial Terminal หรือโปรแกรมอื่นที่กำลังใช้ COM
- ตรวจว่า Agent `41953` ไม่ได้เปิด COM เดียวกัน
- ตรวจเลข COM ใน `config.json` และหน้าเว็บ
- Agent จะลองเปิดพอร์ตใหม่อัตโนมัติทุกประมาณ 5 วินาที

### มีข้อความขยะหรือน้ำหนักไม่ถูกต้อง

- ตรวจ Baud rate, Data bits, Parity และ Stop bits ให้ตรงกับเครื่องชั่ง
- ค่าที่พบบ่อยที่สุดคือ `9600 / 8 / none / 1` หรือ 9600 8N1
- ตรวจการต่อขา TX/RX/GND และชนิดสาย RS232

### Agent เปิดพอร์ตได้แต่ไม่มีน้ำหนัก

- เปิด Continuous Output หรือ Print Output ที่เครื่องชั่ง
- ตรวจว่าสายส่งข้อมูลจริง ไม่ใช่สายชาร์จหรือ adapter ที่ไม่มี Driver
- เปิด `http://127.0.0.1:41952/health` และตรวจ `lastReading`

## 13. ถอนการติดตั้ง Agent

เปิด PowerShell แบบ Administrator ในโฟลเดอร์ Agent แล้วรัน:

```powershell
cd C:\KPF\local-scale-agent
npm run uninstall-task
```

คำสั่งนี้จะหยุดและลบ Scheduled Task `KPF Local Scale Agent` แต่จะไม่ลบโฟลเดอร์หรือ `config.json`

## Checklist ส่งมอบเครื่อง

- [ ] Windows เห็น USB-to-RS232 เป็น COM Port
- [ ] ตั้งค่า Serial ที่เครื่องชั่งตรงกับหน้าเว็บ
- [ ] Agent folder อยู่ตำแหน่งถาวร
- [ ] `http://127.0.0.1:41952/health` แสดง `ok: true`
- [ ] `/ports` พบ COM ที่ต้องการ
- [ ] หน้า `/production-line/weight-scale` แสดงน้ำหนัก Realtime
- [ ] Auto Save ทำงานเมื่อน้ำหนักนิ่งและผ่านเกณฑ์
- [ ] บาร์โค้ด รายการสต็อก และฉลากถูกต้อง
- [ ] Restart แล้ว Agent เริ่มอัตโนมัติ
- [ ] ไม่เกิดการแย่ง COM กับ Agent พอร์ต `41953`
