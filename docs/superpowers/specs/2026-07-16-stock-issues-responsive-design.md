# Stock Issues Responsive Design

## Scope

ปรับเฉพาะหน้า `/production-line/stock/issues` ให้ใช้งานได้ตั้งแต่มือถือจอแคบ แท็บเล็ต โน้ตบุ๊ก และเดสก์ท็อป โดยไม่เปลี่ยน business logic, API, การสแกน, การเบิก, การยกเลิก หรือรูปแบบข้อมูล

## Approved mobile behavior

- คงตารางรายการเบิกล่าสุดและตารางในหน้าต่างเลือกรายการไว้
- บนจอแคบ ตารางเลื่อนแนวนอนภายในกรอบของตัวเอง ไม่ทำให้ทั้งหน้าเว็บล้นแนวนอน
- ส่วนอื่นทั้งหมดต้องปรับขนาดและเรียงตัวตาม viewport

## Layout design

### Main page

- ลด outer spacing บนมือถือและเพิ่มตาม breakpoint เดิมของ Tailwind
- แถบสถานะสามารถตัดบรรทัดและไม่ชนกับวันที่/เวลา
- กล่อง scanner กว้างเต็มพื้นที่บนมือถือ ลด padding, icon และขนาดตัวอักษร แต่คงขนาดใหญ่สำหรับจอ `sm` ขึ้นไป
- ข้อมูลรายการที่สแกนล่าสุดใช้ grid สองคอลัมน์บนมือถือ และขยายเป็นแนวนอนบนจอใหญ่
- ตัวเลือกประเภท วันที่ ปุ่มกล้อง และปุ่มเลือกรายการกว้างเต็มคอลัมน์ มี touch target อย่างน้อย 44px

### Recent issues

- หัวข้อและ summary เรียงแนวตั้งบนมือถือ แล้วกลับเป็นแนวนอนเมื่อพื้นที่พอ
- ตารางมีความกว้างขั้นต่ำที่อ่านคอลัมน์ครบ และอยู่ใน `overflow-x-auto` พร้อม overscroll ภายใน
- pagination สามารถ wrap/stack บนมือถือ ปุ่มก่อนหน้าและถัดไปไม่ถูกบีบ

### Issue picker modal

- ใช้ความสูงตาม dynamic viewport (`dvh`) บนมือถือ เพื่อไม่ถูก browser chrome บัง
- filters เรียงหนึ่งคอลัมน์บนมือถือ แล้วขยายตาม breakpoint
- product filter ยกเลิก fixed minimum width บนมือถือ
- summary, table scroller และ footer ไม่ดัน modal กว้างเกิน viewport
- ปุ่มยืนยัน/ยกเลิกกว้างเต็มแถวบนมือถือและกลับเป็นขนาดปกติบนจอใหญ่

### Camera modal

- จำกัดขนาดด้วย dynamic viewport และลด padding รอบ modal บนมือถือ
- preview รักษา aspect ratio โดยไม่ล้นจอ
- ปุ่มควบคุม wrap/stack เมื่อพื้นที่ไม่พอ

## Accessibility

- คง native buttons/inputs และ accessible labels ที่มีอยู่
- เพิ่ม focus-visible state ให้ controls ที่แก้
- interactive targets มีความสูงไม่น้อยกว่า 44px บน touch layout
- dynamic status/toast ต้องไม่ถูกตัดออกจาก viewport

## Verification

- เพิ่ม regression checks สำหรับ responsive containment และ mobile modal layout
- ตรวจ viewport อย่างน้อย 360px, 390px, 768px, 1024px และ desktop
- รัน focused tests, ESLint และ production build

## Out of scope

- ไม่เปลี่ยนตารางเป็น card
- ไม่เปลี่ยน header/navigation ส่วนกลางนอกเหนือจากการใช้งานของหน้านี้
- ไม่แก้ service, API, Supabase หรือ stock calculation
