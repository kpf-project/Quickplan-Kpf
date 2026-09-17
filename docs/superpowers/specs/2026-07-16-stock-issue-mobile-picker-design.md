# Stock Issue Mobile Picker Design

## Goal

ทำให้หน้าต่าง “เลือกรายการเบิก” บนมือถือค้นหา เลือกรายการ และยืนยันได้ง่ายขึ้น โดยคงตารางแบบเลื่อนแนวนอนและไม่เปลี่ยน logic/API

## Approved behavior

- Mobile แสดงช่องค้นหาและปุ่มค้นหาตลอดเวลา
- วันที่เริ่มต้น วันที่สิ้นสุด และตัวกรองสินค้าอยู่ใต้ปุ่ม “ตัวกรองเพิ่มเติม” ซึ่งปิดไว้เริ่มต้น
- Tablet/desktop (`lg` ขึ้นไป) แสดง filters แบบเดิม
- ตารางเป็นพื้นที่หลักและเลื่อนแนวนอนภายใน modal
- Mobile footer แสดงจำนวน/น้ำหนักที่เลือก pagination แบบกะทัดรัด และปุ่มยืนยันที่แตะง่าย
- Modal header ลดความสูงและซ่อนคำอธิบายยาวบนมือถือ

## Constraints

- ไม่เปลี่ยน picker query, selected-item state, pagination behavior หรือ batch issue payload
- ไม่เปลี่ยนตารางเป็น card
- Native controls ต้องมี accessible label, `aria-expanded` และ focus-visible state

## Verification

- Regression test ตรวจ mobile filter toggle contract, compact pagination และ footer selection summary
- รัน focused test, ESLint และ production build
