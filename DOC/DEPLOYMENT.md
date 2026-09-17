# Stocksales Deployment Guide (Windows Server)

เอกสารนี้อธิบายการ Deploy ใหม่ทั้งระบบและการอัปเดตเวอร์ชันบน Windows Server
พร้อม Cloudflare Tunnel สำหรับโดเมน `stock.kpfoods.co.th`

---

## 1) ข้อกำหนดพื้นฐาน
- Node.js LTS + npm
- PM2 (รัน Next.js แบบ production)
- Cloudflared (Cloudflare Tunnel)
- โดเมนใน Cloudflare (`stock.kpfoods.co.th`)
- แนะนำติดตั้งผ่าน Chocolatey (ถ้ายังไม่มีให้ติดตั้งก่อน)

---

## 2) โฟลเดอร์โปรเจกต์ (เครื่องจริง)
```
C:\Users\Administrator\Desktop\Stocksales\Stocksales
```

---

## 3) Environment (.env.local)
ไฟล์ต้องอยู่ที่:
```
C:\Users\Administrator\Desktop\Stocksales\Stocksales\.env.local
```
ต้องมีค่าต่อไปนี้อย่างน้อย:
- DB_... (ฐานข้อมูล)
- AUTH_SESSION_SECRET
- AUTH_PIN_CONFIG (hash + salt เท่านั้น ไม่เก็บ PIN ตรง)

หมายเหตุ: หากแก้ `.env.local` ต้องรีสตาร์ต PM2 ทุกครั้ง

---

## 4) Deploy ใหม่ทั้งระบบ (Fresh Install - ไม่มี Git)
### 4.1 ติดตั้ง Chocolatey (ครั้งเดียว)
เปิด PowerShell แบบ Run as Administrator:
```
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```
ปิด/เปิด PowerShell ใหม่ จากนั้นเช็ค:
```
choco -v
```

### 4.2 ติดตั้ง Node.js LTS, PM2, Cloudflared
```
choco install nodejs-lts -y
refreshenv
npm install -g pm2
choco install cloudflared -y
```
เช็ค:
```
node -v
npm -v
pm2 -v
cloudflared -v
```

### 4.3 เตรียมโปรเจกต์
1) สร้างโฟลเดอร์:
```
mkdir C:\Users\Administrator\Desktop\Stocksales
mkdir C:\Users\Administrator\Desktop\Stocksales\Stocksales
```
2) คัดลอกไฟล์โปรเจกต์ลงโฟลเดอร์นี้  
   - ห้ามคัดลอก `node_modules` และ `.next`
3) วาง `.env.local` ที่แก้ล่าสุด

### 4.4 Install + Build
```
cd C:\Users\Administrator\Desktop\Stocksales\Stocksales
npm install
npm run build
```

### 4.5 รันด้วย PM2
```
pm2 start cmd --name stocksales -- /c "npm run start"
pm2 save
pm2 list
```
ทดสอบในเครื่อง:
```
http://localhost:3000
```

### 4.6 ให้รันอัตโนมัติหลังรีบูต (Task Scheduler - ไม่ต้องใช้รหัสผ่าน)
ใช้ Task Scheduler เพราะ PM2 `startup` ไม่รองรับ Windows

1) สร้างสคริปต์สำหรับ resurrect:
```
mkdir C:\Users\Administrator\Desktop\Stocksales\Stocksales\scripts
notepad C:\Users\Administrator\Desktop\Stocksales\Stocksales\scripts\pm2-resurrect.cmd
```
วางเนื้อหา:
```bat
@echo off
set PM2_HOME=C:\Users\Administrator\.pm2
cd /d C:\Users\Administrator\Desktop\Stocksales\Stocksales
C:\Users\Administrator\AppData\Roaming\npm\pm2.cmd resurrect
```

2) เปิด:
```
taskschd.msc
```
3) Create Task
   - Name: `Stocksales-PM2`
   - Run whether user is logged on or not
   - Run with highest privileges
   - Change User or Group: `SYSTEM`
4) Trigger: At startup
5) Action: Start a program
   - Program/script:
     ```
     C:\Windows\System32\cmd.exe
     ```
   - Add arguments:
     ```
     /c "C:\Users\Administrator\Desktop\Stocksales\Stocksales\scripts\pm2-resurrect.cmd"
     ```
   - Start in:
     ```
     C:\Users\Administrator\Desktop\Stocksales\Stocksales
     ```

---

## 5) Cloudflare Tunnel (ใช้โดเมนเดิม)
### 5.1 ย้าย Tunnel เดิมจากเครื่องเก่า (แนะนำ)
คัดลอกไฟล์จากเครื่องเก่ามาไว้ที่:
```
C:\ProgramData\cloudflared\config.yml
C:\ProgramData\cloudflared\<tunnel-id>.json
```
ตัวอย่าง `config.yml`:
```yaml
tunnel: e9ebda83-372c-47bb-aabd-1600deaaf528
credentials-file: C:\ProgramData\cloudflared\e9ebda83-372c-47bb-aabd-1600deaaf528.json
logfile: C:\ProgramData\cloudflared\cloudflared.log
loglevel: info

ingress:
  - hostname: stock.kpfoods.co.th
    service: http://localhost:3000
  - service: http_status:404
```

สร้าง Windows Service:
```
sc delete CloudflaredStocksales
sc create CloudflaredStocksales binPath= "\"C:\ProgramData\chocolatey\lib\cloudflared\tools\cloudflared.exe\" tunnel --config \"C:\ProgramData\cloudflared\config.yml\" run" start= auto
sc start CloudflaredStocksales
```
ตรวจสอบ:
```
sc query CloudflaredStocksales
```

ปิด service เครื่องเก่าเพื่อไม่ให้ชน:
```
sc stop CloudflaredStockslaes
sc delete CloudflaredStockslaes
```

### 5.2 สร้าง Tunnel ใหม่ (กรณีไม่มีไฟล์เดิม)
```
cloudflared tunnel login
cloudflared tunnel create stocksales
cloudflared tunnel route dns stocksales stock.kpfoods.co.th
```
จากนั้นสร้าง `config.yml` และ Service แบบด้านบน

ทดสอบจากภายนอก:
```
https://stock.kpfoods.co.th
```

---

## 6) ตรวจสอบสถานะ (Health Check)
### PM2
```
pm2 list
pm2 logs stocksales --lines 100
```

### Cloudflared Service
```
sc query CloudflaredStocksales
type C:\ProgramData\cloudflared\cloudflared.log
```

---

## 7) อัปเดตเวอร์ชัน (Deploy รอบถัดไป)
### A) ถ้าใช้ Git
```
cd C:\Users\Administrator\Desktop\Stocksales\Stocksales
git pull
npm install
npm run build
pm2 restart stocksales
```

### B) ถ้าอัปเดตด้วยการคัดลอกไฟล์
1) ปิดแอปก่อน:
```
pm2 stop stocksales
```
2) คัดลอกไฟล์เวอร์ชันใหม่มาทับโฟลเดอร์โปรเจกต์  
   - อย่าทับ `.env.local`
3) ติดตั้งและ build:
```
cd C:\Users\Administrator\Desktop\Stocksales\Stocksales
npm install
npm run build
```
4) สตาร์ทกลับ:
```
pm2 start cmd --name stocksales -- /c "npm run start"
pm2 save
```

### C) อัปเดตเฉพาะโลโก้/ไฟล์ static (ไม่แก้โค้ด)
ใช้เมื่อเปลี่ยนเฉพาะไฟล์ใน `public/` เช่น `public/logokpf.png`
1) คัดลอกไฟล์ใหม่มาทับ (ชื่อไฟล์เดิม)
2) ล้าง cache รูปที่ optimize แล้ว (กรณีใช้ `next/image`)
```
cd C:\Users\Administrator\Desktop\Stocksales\Stocksales
rmdir /s /q .next\cache\images
```
3) รีสตาร์ท PM2 เพื่อให้โหลดรูปใหม่
```
pm2 restart stocksales
```
หมายเหตุ: ปกติไม่ต้อง `npm run build` หากเปลี่ยนเฉพาะไฟล์ใน `public/`

### หมายเหตุกรณี build มีปัญหา
ถ้า build ค้างหรือ error จาก cache ให้ลบ `.next` แล้วลอง build ใหม่:
```
rmdir /s /q .next
npm run build
```

---

## 8) วิธีแก้เมื่อระบบล้ม (Recovery)
### A) เว็บล่ม / PM2 หยุด
```
pm2 restart stocksales
pm2 list
```
ถ้ายังไม่ขึ้น:
```
pm2 delete stocksales
pm2 start cmd --name stocksales -- /c "npm run start"
pm2 save
```

### B) Tunnel ไม่ขึ้น (Error 1033)
```
sc query CloudflaredStocksales
sc stop CloudflaredStocksales
sc start CloudflaredStocksales
```
ถ้ายังไม่ได้:
```
type C:\ProgramData\cloudflared\cloudflared.log
cloudflared tunnel --config "C:\ProgramData\cloudflared\config.yml" --loglevel info run
```

### C) เปลี่ยนค่าใน .env.local แล้วเว็บไม่อัปเดต
```
pm2 restart stocksales
```

---

## 9) หมายเหตุสำคัญ
- Production ต้องใช้ HTTPS (Cloudflare Tunnel ทำให้แล้ว)
- Session cookie ใช้ `Secure` → ถ้าเข้าเว็บแบบ HTTP จะล็อกอินไม่ติด
- แก้ `config.yml` ต้องระวัง indent ให้ถูกต้อง

---

## 10) เพิ่มโปรเจกต์ใหม่บนเครื่องเดิม (ซับโดเมนใหม่)
หัวข้อนี้ใช้เมื่อมีโปรเจกต์เดิมอยู่แล้ว และต้องการเพิ่มโปรเจกต์ใหม่ให้รันพร้อมกัน

### 10.1 กำหนดค่าที่ต้องแยก
- โฟลเดอร์โปรเจกต์ใหม่ (เช่น `C:\Users\Administrator\Desktop\AnotherApp`)
- พอร์ตใหม่ (เช่น 3001)
- ชื่อ PM2 ใหม่ (เช่น `anotherapp`)
- ซับโดเมนใหม่ (เช่น `app2.kpfoods.co.th`)

### 10.2 เตรียมโปรเจกต์ใหม่
1) สร้างโฟลเดอร์:
```
mkdir C:\Users\Administrator\Desktop\AnotherApp
```
2) คัดลอกไฟล์โปรเจกต์ใหม่ลงโฟลเดอร์นี้  
   - ห้ามคัดลอก `node_modules` และ `.next`
3) วาง `.env.local` ของโปรเจกต์ใหม่

### 10.3 Install + Build
```
cd C:\Users\Administrator\Desktop\AnotherApp
npm install
npm run build
```

### 10.4 รันโปรเจกต์ใหม่ด้วย PM2 (กำหนดพอร์ตใหม่)
```
pm2 start cmd --name anotherapp -- /c "set PORT=3001 && npm run start"
pm2 save
pm2 list
```
ทดสอบในเครื่อง:
```
http://localhost:3001
```

### 10.5 เพิ่มซับโดเมนใหม่ใน Cloudflare Tunnel
แก้ไฟล์:
```
C:\ProgramData\cloudflared\config.yml
```
ตัวอย่างเพิ่ม ingress:
```yaml
ingress:
  - hostname: stock.kpfoods.co.th
    service: http://localhost:3000
  - hostname: sales.kpfoods.co.th
    service: http://localhost:3001
  - hostname: app2.kpfoods.co.th
    service: http://localhost:3001
  - service: http_status:404
```
รีสตาร์ท Service:
```
sc stop CloudflaredStocksales
sc start CloudflaredStocksales
```

### 10.6 ห้ามทำ (สำคัญ)
- ห้ามใช้พอร์ตซ้ำกับโปรเจกต์เดิม
- ห้ามใช้ชื่อ PM2 ซ้ำ
- ห้ามแก้ `.env.local` ของโปรเจกต์เดิม
- ห้ามลบ/แก้ `C:\ProgramData\cloudflared\<tunnel-id>.json`
- ห้ามลบ `pm2 save` ของเดิม (ต้องใช้ `pm2 save` หลังเพิ่มโปรเจกต์ใหม่เท่านั้น)

### 10.7 ตรวจสอบจากภายนอก
```
https://app2.kpfoods.co.th
```
ถ้าเข้าไม่ได้ให้เช็ค:
```
sc query CloudflaredStocksales
type C:\ProgramData\cloudflared\cloudflared.log
```

---

จบขั้นตอน deploy และการดูแลระบบ
