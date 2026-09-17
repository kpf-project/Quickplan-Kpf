# Production Line - System Overview

เอกสารนี้สรุปภาพรวมระบบ Production Line และสิ่งที่พัฒนาจนถึงตอนนี้แบบละเอียด
เพื่อให้คนที่เข้ามาใหม่เข้าใจได้ทันทีว่าระบบทำอะไร อยู่ส่วนไหน และใช้งานอย่างไร

---

## 1) ระบบนี้คืออะไร
ระบบนี้เป็นหน้าเว็บสำหรับฝ่ายปฏิบัติการ/หลังบ้าน ใช้ดูข้อมูลจากฐานข้อมูลภายใน (LAN)
และเปิดให้เข้าถึงจากภายนอกผ่าน API Gateway ที่ปลอดภัย

เป้าหมายหลักของระบบ:
- ดูข้อมูลวัตถุดิบคงเหลือ (Raw Materials)
- ดูรายงานสแกนนิ้ว (Consolidated)
- ดูค่าขั้นต่ำ-สูงสุด และค่าที่ควรสั่งของสินค้า (SKU Min/Max)
- ดูรายการคำสั่งซื้อจากซัพพลายเออร์ (Suppliers)

---

## 2) สถาปัตยกรรม (Architecture)
ระบบแบ่งเป็น 2 ส่วนหลัก:

1) **Frontend / App (Production-Line)**
   - เป็น Next.js (App Router)
   - ทำหน้าที่แสดงผลหน้าเว็บและเรียก API ภายในของตัวเอง (`/api/...`)
   - ไม่เชื่อมต่อ DB โดยตรงจากฝั่ง client

2) **API Gateway (KPF-API-Gateway)**
   - เป็น Node.js + Express
   - รันอยู่ใน LAN (เครื่องที่เข้าถึง DB ได้)
   - ให้ Frontend เรียกผ่าน HTTPS จากภายนอก
   - ป้องกันด้วย Cloudflare Access + API Key

ภาพรวมการไหลของข้อมูล:
```
Browser -> Production-Line (/api/*) -> KPF-API-Gateway -> SQL Server (LAN)
```

---

## 3) ฐานข้อมูลที่เกี่ยวข้อง
ระบบดึงข้อมูลจาก SQL Server ภายใน 2 เครื่องหลัก:

1) ERP / Inventory
   - IP: 192.168.210.5
   - DB: KPF_ERP_V3
   - ใช้กับ Raw Materials, SKU Min/Max, Suppliers

2) HR / Attendance
   - IP: 192.168.210.6
   - DB: BPLUSHRM_KPF (+ Pm2014_SU)
   - ใช้กับรายงานสแกนนิ้ว (Consolidated)

---

## 4) ระบบความปลอดภัย (Security)
API Gateway ใช้ 2 ชั้น:

1) **Cloudflare Access**
   - จำกัดการเข้าผ่านอีเมล
   - ใช้กับ URL แบบ HTTPS เช่น https://api.kpfoods.co.th

2) **API Key**
   - ใช้ header: `x-api-key`
   - ใช้เมื่อต้องเรียก API จากสคริปต์/เครื่องที่ไม่ได้ผ่าน Access

---

## 5) หน้าหลักของระบบ (Pages)
เส้นทางที่ใช้งาน:

1) **Raw Materials**
   - URL: `/raw-materials`
   - ฟีเจอร์หลัก:
     - ดู stock แยกตาม LOT
     - สรุปยอดรวมตาม SKU
     - เลือกประเภท (ICCAT) แบบ multi-select
     - Filter ตามวันที่เอกสาร
     - ซ่อน QTY ติดลบ
   - มี 2 มุมมอง:
     - แยกตาม LOT
     - สรุปยอดรวม (รวมทุก LOT เฉพาะค่าบวก)
     - เพิ่มคอลัมน์: ต่ำสุด / สูงสุด / ต่ำสุดในการสั่งซื้อ / ยอดการผลิต (-)

2) **รายงานสแกนนิ้ว**
   - URL: `/consolidated`
   - ใช้ดูรายงานการเข้างาน (สรุปผู้มาทำงาน)

3) **SKU Min/Max**
   - URL: `/sku-min-max`
   - ใช้ดูค่าที่ควรสั่งซื้อ (ขั้นต่ำ/สูงสุด)
   - มีช่องค้นหาตาม ICCAT_CODE / ICCAT_NAME
   - แสดงคอลัมน์หลักตามลำดับที่กำหนด

4) **ซัพพลายเออร์**
   - URL: `/suppliers`
   - แสดงรายการคำสั่งซื้อซัพพลายเออร์ทั้งหมด
   - จำกัด ICCAT_CODE เฉพาะ 01/02/03/05/08/10

---

## 6) API Gateway Endpoints (หลัก)
ทั้งหมดเป็น Read-only (GET เท่านั้น)

1) `/api/raw-materials`
   - รองรับ params:
     - `brandCodes`, `iccatCodes`, `skuName`
     - `dateFrom`, `dateTo`
     - `page`, `pageSize`

2) `/api/iccat-types`
   - คืนค่า ICCAT_CODE + ICCAT_NAME

3) `/api/sku-min-max`
   - คืนค่า SKU Min/Max แบบ full (ใช้กับหน้า SKU Min/Max)

4) `/api/sku-min-max-by-sku`
   - รับ `skus=SKU1,SKU2,...`
   - คืนค่าเฉพาะ SKU_MIN_QTY / SKU_MAX_QTY / SKU_MIN_ORDER

5) `/api/suppliers`
   - Query ตาม SQL ที่ให้มา
   - รองรับ pagination

---

## 7) Deployment (Production)
ใช้ PM2 + Cloudflare Tunnel

1) **Production-Line (Frontend)**
   - รันด้วย PM2 ที่พอร์ต 3002
   - ใช้ `.env.local` เพื่อชี้ไปที่ API Gateway

2) **KPF-API-Gateway**
   - รันด้วย PM2 ที่พอร์ต 4000
   - มีไฟล์ `.env.local` สำหรับ DB และ Security

3) **Cloudflare Tunnel**
   - ผูกโดเมน:
     - `api.kpfoods.co.th` -> `localhost:4000`
     - `data.kpfoods.co.th` -> `localhost:3002`

---

## 8) สิ่งที่พัฒนาแล้ว (Summary)
สิ่งที่เพิ่มในระบบตอนนี้:
- Raw Materials page + ฟีเจอร์สรุปยอดรวม
- SKU Min/Max page
- Suppliers page
- API Gateway (Read-only)
- ระบบ auth: Cloudflare Access + API Key
- รองรับการใช้งานนอก LAN ผ่าน HTTPS

---

## 9) หมายเหตุการดูแล (Ops Notes)
- ถ้าแก้ `.env.local` ต้อง restart PM2 ทุกครั้ง
- ถ้า API Gateway เปลี่ยนโค้ด ต้อง restart `kpf-api-gateway`
- ตรวจสอบ log ด้วย:
  - `pm2 logs kpf-api-gateway`
  - `pm2 logs production-line`

---

จบเอกสาร
