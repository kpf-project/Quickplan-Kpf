# Self-Hosted Supabase Runbook

อัปเดตล่าสุด: July 16, 2026

เอกสารนี้สรุป 4 เรื่อง:

1. เราทำอะไรไปแล้วกับระบบปัจจุบัน
2. ถ้าจะสร้างโปรเจคใหม่บน self-hosted Supabase ต้องทำอย่างไร
3. ถ้ามีอีกระบบที่ยังอยู่บน Supabase Cloud แล้วจะย้ายมา local/self-hosted ต้องทำอย่างไร
4. หนึ่งเครื่อง local สามารถมีหลายโปรเจคได้ไหม และควรจัดอย่างไร

เอกสารนี้ตั้งใจเขียนให้ทำตามได้จริง ไม่ใช่แค่สรุปภาพรวม

---

## 1. สรุปสถานะปัจจุบัน

ตอนนี้ระบบนี้ย้ายจาก Supabase Cloud มายัง self-hosted Supabase บน Ubuntu VM เรียบร้อยแล้ว โดยโครงสร้างหลักเป็นแบบนี้:

- ESXi Host
- Windows Server 2022 VM เดิม
- Ubuntu VM ใหม่ชื่อ `UBUNTU-KPF`
- ภายใน Ubuntu VM รัน Docker + Docker Compose
- ภายใน Docker รัน self-hosted Supabase stack
- แอปใน repo นี้ถูกแก้ให้ชี้ไปที่ self-hosted แล้ว

สรุปสั้นที่สุด:

- Database ย้ายแล้ว
- Storage files ย้ายแล้ว
- App config ฝั่ง repo ถูกชี้ไป local แล้ว
- Build ผ่านแล้ว
- ยังมี type errors เดิมในโปรเจคบางจุด แต่ไม่ใช่ปัญหาที่เกิดจากการย้าย Supabase

---

## 2. สิ่งที่ทำไปแล้วแบบละเอียด

### 2.1 สร้าง Ubuntu VM แยกจาก Windows เดิม

เราไม่ได้พยายามยัด self-hosted Supabase ลงบน Windows Server ตรง ๆ เพราะ stack ของ Supabase self-hosted ออกแบบมาสำหรับ Linux + Docker มากกว่า และการรันบน Linux VM จะนิ่งกว่า ดูแลง่ายกว่า และตรงตามเอกสารมากกว่า

สิ่งที่ทำ:

- ตรวจสอบว่าเครื่องนี้จริง ๆ อยู่บน VMware/ESXi
- เข้า ESXi Host Client
- สร้าง VM ใหม่ชื่อ `UBUNTU-KPF`
- ใช้ Ubuntu Server 24.04 LTS
- แยก VM นี้ออกจาก Windows VM เดิม

ผลคือ:

- ของเดิมบน Windows ไม่โดนยุ่ง
- Supabase self-hosted ไปอยู่ใน VM ใหม่แยกต่างหาก
- ถ้ามีปัญหา เราจัดการเฉพาะ VM นี้ได้

### 2.2 ติดตั้ง Ubuntu Server

ระหว่างติดตั้ง:

- เลือก Ubuntu Server ปกติ
- ใช้ disk ของ VM ใหม่เท่านั้น
- เปิด SSH เพื่อ remote เข้า Ubuntu ได้จาก Windows
- ติดตั้งเสร็จแล้ว reboot เฉพาะ VM `UBUNTU-KPF`

IP ของ Ubuntu VM ที่ได้ในตอนนั้นคือ:

- `192.168.210.185`

### 2.3 เปิดใช้งาน SSH และเชื่อมต่อจาก Windows

หลังติดตั้ง Ubuntu เสร็จ เราใช้ Windows PowerShell เชื่อมเข้า Ubuntu ผ่าน SSH:

```bash
ssh administrator@192.168.210.185
```

จุดนี้สำคัญ เพราะหลังจากนี้งานทั้งหมดฝั่ง server ทำผ่าน SSH เป็นหลัก ไม่ต้องนั่งใช้ console ของ ESXi ตลอด

### 2.4 เตรียม Docker บน Ubuntu

เราติดตั้งและตรวจสอบ Docker จนใช้งานได้จริง

สิ่งที่ตรวจสอบ:

- `docker version`
- `docker compose version`
- ทดสอบรัน container ได้จริง

หมายเหตุ:

- ตอนแรก user ปกติยังไม่มีสิทธิ์คุยกับ Docker socket จึงต้องใช้ `sudo docker ...`
- ถ้าต้องการใช้แบบไม่ต้องใส่ `sudo` ทุกครั้ง ค่อยเพิ่ม user เข้า group `docker` ภายหลังได้

### 2.5 ตั้ง self-hosted Supabase stack

เราใช้แนวทาง Docker Compose ตามเอกสาร self-hosted Supabase แล้วสร้างโฟลเดอร์สำหรับ stack แยกต่างหาก

โครงหลักที่ใช้:

- clone repo `supabase/supabase`
- copy เฉพาะโฟลเดอร์ `docker`
- สร้าง `.env`
- กำหนด secrets เอง
- สร้าง `ANON_KEY` และ `SERVICE_ROLE_KEY` จาก `JWT_SECRET`
- รัน `docker compose up -d`

### 2.6 เปลี่ยน stack ไปใช้ PostgreSQL 17

เหตุผล:

- Cloud project ที่จะ dump มาบางตัวอยู่บน PostgreSQL 17
- ถ้าปลายทาง local ใช้ version ต่ำกว่า อาจเจอปัญหา restore หรือ behavior mismatch

สิ่งที่ทำ:

- ใช้ compose override สำหรับ PG17
- ล้าง data volume ตอนแก้รอบแรกเพื่อให้ฐานใหม่เริ่มสะอาด
- รัน stack ใหม่จนทุก container health ขึ้นปกติ

ผลสุดท้าย stack ที่ใช้งานอยู่เป็น PG17-based self-hosted Supabase

### 2.7 แก้ปัญหา initial stack และ health check

ระหว่างทางเคยเจอปัญหา:

- container `supabase-db` unhealthy
- compose บางรอบขึ้นไม่ครบ
- volume เก่าค้างจากรอบก่อนหน้า

วิธีแก้ที่ใช้:

- หยุด stack
- ลบ data directory/volume ที่เกี่ยวกับ db เฉพาะ stack นี้
- สตาร์ทใหม่ด้วย compose ที่ถูกต้อง

จุดสำคัญคือเราจัดการเฉพาะ volume/data ของ stack self-hosted นี้ ไม่ได้ไปแตะ VM หรือ service อื่น

### 2.8 ย้ายข้อมูล Database จาก Supabase Cloud

ระหว่างย้าย database มีประเด็นสำคัญ 3 เรื่อง:

#### เรื่องที่ 1: host ที่ใช้ตอนแรกผิด

ตอนแรกใช้ project คนละตัว/host คนละตัว ทำให้ dump ออกมาไม่ตรง

ภายหลังยืนยัน project ที่ถูกต้องคือ:

- project ref: `ruqchgaychztvokdhzem`

#### เรื่องที่ 2: direct DB host ใช้ IPv6

host แบบ direct connection:

- `db.ruqchgaychztvokdhzem.supabase.co`

ใน environment นี้ direct connection ฝั่ง VM เข้าวิ่งไป IPv6 แล้วชนปัญหา network unreachable

ดังนั้นรอบที่ใช้งานได้จริง เราใช้ session/shared pooler ที่เป็น IPv4-compatible แทน

#### เรื่องที่ 3: ต้องใช้ `pg_dump` version ให้ตรงกับ source

เคยเจอ:

- source เป็น PostgreSQL 17.6
- `pg_dump` ในเครื่องเป็น 16.x
- จึงขึ้น `server version mismatch`

วิธีแก้:

- ใช้ container `postgres:17` มารัน `pg_dump`

แนวคำสั่งที่ใช้จริงเป็นแบบนี้:

```bash
sudo docker run --rm \
  -v "$PWD:/work" \
  postgres:17 \
  pg_dump \
    'postgresql://postgres.ruqchgaychztvokdhzem:[PASSWORD-URL-ENCODED]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' \
    --clean \
    --if-exists \
    --quote-all-identifiers \
    --no-owner \
    --no-privileges \
    --verbose \
    -f /work/supabase_cloud_dump_ruqch.sql
```

หมายเหตุสำคัญ:

- password ถ้ามี `#` ต้อง encode เป็น `%23`
- pooler ที่ใช้ dump รอบนี้ใช้ port `5432`
- ถ้าใส่ user หรือ password ผิด จะขึ้น password authentication failed

### 2.9 Restore dump เข้า self-hosted database

หลัง dump สำเร็จ เรา import เข้า `supabase-db` container ของ local stack

เมื่อ restore เสร็จ เราตรวจสอบ:

- schemas มีครบ
- tables ใน `public` มีครบ
- Studio เปิดดูได้
- แอปเชื่อมได้

ตัวอย่างสิ่งที่ตรวจสอบ:

- schema `auth`
- schema `storage`
- schema `public`
- ตาราง business หลักทั้งหมด

### 2.10 ตรวจสอบว่า data หลักเข้ามาแล้ว

เราเช็กแล้วว่าตาราง business หลักใน `public` มาแล้ว เช่น:

- `product_master`
- `product_sales`
- `product_sales_uploads`
- `transactions`
- `sales_targets`
- `user_accounts`
- `user_sessions`
- และตารางอื่น ๆ รวมทั้งหมด 21 ตารางใน `public`

แปลว่า database หลักถูกย้ายเข้ามาแล้ว

### 2.11 ย้าย Storage buckets และ Storage files

หลัง restore database เราตรวจเจอว่า bucket metadata มาครบ แต่ object files ยังไม่มา

ตรวจสอบตอนนั้นพบว่า:

- buckets มีแล้ว
- `storage.objects` ยังนับได้ 0

ดังนั้นเราทำ storage migration แยกอีกขั้น

ผลสุดท้ายที่ย้ายมาได้:

- `erp-product-images`: 92 files
- `product-images`: 127 files
- `uploads`: 0 files

เมื่อตรวจ `storage.objects` ฝั่ง local แล้วพบว่า:

- `erp-product-images` = 92
- `product-images` = 127

แปลว่า file metadata และ file content มาครบตามที่มีอยู่จริง

### 2.12 แก้ค่าในแอปให้ชี้ self-hosted

ฝั่ง repo นี้มีการแก้ให้ runtime ใช้ self-hosted แทน cloud แล้ว

ไฟล์สำคัญที่ถูกแตะ:

- `.env.local`
- `.env.example`
- `next.config.js`
- `src/components/unoptimized-image.tsx`
- `package.json`
- `scripts/gen-supabase-types.mjs`
- `public/secret.txt`

### 2.13 รายละเอียดการแก้ใน repo

#### `.env.local`

เปลี่ยนให้ค่าพวกนี้ชี้มาที่ self-hosted:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

ผลคือทั้ง client-side และ server-side ของแอปจะคุยกับ self-hosted

#### `.env.example`

ทำให้เป็น placeholder ที่ปลอดภัย ไม่ควรมี secret จริงค้างอยู่

#### `next.config.js`

แก้เพื่อรองรับ self-hosted storage host และ CSP ที่เกี่ยวข้อง เช่น:

- `images.remotePatterns`
- `connect-src`
- `img-src`

เพื่อให้ browser โหลดรูปจาก self-hosted Supabase storage ได้

#### `src/components/unoptimized-image.tsx`

ไฟล์นี้ถูกแก้เพื่อให้:

- รู้จัก self-hosted storage URL
- ใช้ loader ได้ถูกต้อง
- ส่ง `unoptimized` เข้า `<Image />`

จุดนี้สำคัญมาก เพราะก่อนแก้ หน้าบางหน้ารูปไม่ขึ้น แม้ไฟล์จะอยู่ใน storage แล้ว

#### `package.json`

สคริปต์ generate types เดิมผูกกับ cloud project ref

เราเปลี่ยนเป็นใช้:

```bash
node scripts/gen-supabase-types.mjs
```

#### `scripts/gen-supabase-types.mjs`

เพิ่ม script ให้ generate database types จาก `SUPABASE_DB_URL` ของ environment ปัจจุบันแทนการผูกกับ cloud project เดิม

### 2.14 แก้ปัญหารูปไม่ขึ้นในบางหน้า

หลัง storage migration เสร็จ รูปบางหน้าขึ้นแล้ว แต่หน้า "ยอดขายสินค้าเซลล์เครดิต" ยังมีอาการรูปไม่แสดง

ตรวจแล้วสาเหตุอยู่ที่ component image handling ในแอป ไม่ใช่ที่ storage file หาย

จุดที่แก้:

- `src/components/unoptimized-image.tsx`

หลังแก้แล้ว build ผ่าน และ logic รองรับ self-hosted storage ได้ครบขึ้น

### 2.15 ตรวจสอบการ freeze การเขียนไป Cloud

เราไล่เช็กใน repo แล้วว่า runtime code ไม่มีการ hardcode cloud project เดิมในจุดหลัก ๆ ของการเขียนข้อมูลแล้ว

สรุป:

- ใน code path หลักของ repo นี้ ตอน runtime จะอิง environment variables
- ถ้า deployment environment ชี้ self-hosted ทั้งหมด ระบบก็จะเขียนเข้า self-hosted
- ยังต้องระวัง environment ที่อยู่นอก repo เช่น server deploy จริง, Vercel, PM2, Windows Task Scheduler, cron jobs, worker scripts ภายนอก

พูดให้ชัด:

ภายใน repo นี้เราเคลียร์จุดหลักแล้ว
แต่ถ้ามี runtime ที่อยู่นอก repo และยังใช้ env เก่าอยู่ มันยังสามารถเขียนเข้า Cloud ได้

### 2.16 สถานะ verification

สิ่งที่ยืนยันแล้ว:

- self-hosted Supabase containers ขึ้นครบ
- Database migrate แล้ว
- Storage migrate แล้ว
- Buckets อยู่ครบ
- Business tables อยู่ครบ
- Supabase Studio เปิดได้
- แอป build ผ่าน

สิ่งที่ยังไม่ถือว่าเป็น issue จาก migration โดยตรง:

- TypeScript errors เดิมหลายจุดในโปรเจค

จุดนี้เป็น technical debt เดิมของแอป ไม่ใช่ผลจากการย้าย Cloud -> self-hosted

---

## 3. ตอนนี้ local มันรองรับหลายโปรเจคได้ไหม

ได้

แต่คำว่า "หลายโปรเจค" มี 2 แบบ และต้องแยกให้ออก

### แบบที่ 1: หลายแอป ใช้ Supabase project เดียวกัน

เช่น:

- Dashboard A
- Admin B
- Mobile App C

ทั้งหมดคุยกับ self-hosted Supabase project เดียวกัน

แบบนี้ทำได้ง่ายที่สุด

เหมาะเมื่อ:

- ทั้งหมดใช้ database ชุดเดียวกัน
- ใช้ auth ชุดเดียวกัน
- ใช้ storage ชุดเดียวกัน

### แบบที่ 2: หลายแอป แต่แต่ละแอปมี Supabase project ของตัวเอง

เช่น:

- Project Sales
- Project HR
- Project Warehouse

แต่ละตัวมี:

- database คนละก้อน
- auth คนละก้อน
- storage คนละก้อน
- secrets คนละชุด

แบบนี้ก็ทำได้ แต่ต้องแยก stack ให้ชัด

สรุป:

- หนึ่ง local server มีหลาย self-hosted Supabase projects ได้
- แต่ไม่ควรยัดทุกอย่างเข้ากองเดียวถ้า domain งานแยกกันจริง

---

## 4. ถ้าจะมีหลายโปรเจคบนเครื่องเดียว ควรจัดอย่างไร

แนวทางที่ถูกคือ "หนึ่งโปรเจค = หนึ่งโฟลเดอร์ stack = หนึ่งชุด env = หนึ่งชุด volumes"

ตัวอย่างโครงสร้าง:

```text
/srv/supabase/
  project-sales/
    .env
    docker-compose.yml
    docker-compose.pg17.yml
    volumes/
  project-hr/
    .env
    docker-compose.yml
    docker-compose.pg17.yml
    volumes/
  project-warehouse/
    .env
    docker-compose.yml
    docker-compose.pg17.yml
    volumes/
```

แต่ละโปรเจคควรแยก:

- JWT secret
- anon key
- service role key
- DB password
- Kong port
- Studio port
- Postgres exposed port
- Storage volume
- backup files

### สิ่งที่ต้องไม่ใช้ร่วมกันแบบมั่ว

- อย่าใช้ `.env` ไฟล์เดียวร่วมกันหลายโปรเจค
- อย่าใช้ volume db เดียวกันคนละโปรเจค
- อย่า map host port ชนกัน
- อย่าใช้ชื่อ compose project ซ้ำ

### สิ่งที่ควรทำเมื่อมีหลายโปรเจค

- ตั้งชื่อโฟลเดอร์ให้ชัด
- ตั้งชื่อ compose project ให้ชัด
- แยก domain/subdomain
- ทำ reverse proxy ข้างหน้า
- ทำ backup แยกต่อโปรเจค
- บันทึกว่า app ไหนคุยกับ local project ไหน

---

## 5. ถ้าจะสร้างโปรเจคใหม่จากศูนย์บน self-hosted ต้องทำอย่างไร

อันนี้คือกรณี "ยังไม่มี Supabase Cloud ตัวเดิม" หรือ "เริ่มระบบใหม่เลย"

## Step 1: เตรียม resource ของ server

อย่างน้อยต้องรู้ก่อนว่าโปรเจคใหม่จะกินประมาณไหน

ต้องประเมิน:

- CPU
- RAM
- Disk
- จำนวนผู้ใช้
- ขนาดไฟล์ storage
- ปริมาณ cron/jobs
- realtime หนักไหม

สำหรับระบบเล็กถึงกลาง 1 โปรเจค เริ่มต้นแบบประมาณการได้เช่น:

- 2-4 vCPU
- 4-8 GB RAM
- SSD space ตามปริมาณ DB + Storage + backup

ถ้ามีหลายโปรเจคในเครื่องเดียว ต้องเผื่อรวมทั้งหมด

## Step 2: สร้างโฟลเดอร์ใหม่สำหรับโปรเจค

ตัวอย่าง:

```bash
sudo mkdir -p /srv/supabase/project-new
sudo chown -R administrator:administrator /srv/supabase/project-new
cd /srv/supabase/project-new
```

## Step 3: เอา self-hosted docker files มาแยกไว้ในโปรเจคนั้น

ใช้ template จาก `supabase/supabase` docker folder แล้ว copy มาไว้เฉพาะโปรเจคนี้

หลักการ:

- โปรเจคหนึ่งมี compose file ของตัวเอง
- อย่าใช้ compose file ร่วมกันทุกโปรเจค

## Step 4: สร้าง `.env` สำหรับโปรเจคใหม่

ต้องกำหนดอย่างน้อย:

- DB password
- JWT secret
- anon key
- service role key
- Studio login credentials ถ้ามี
- ports
- site URL
- SMTP ถ้าจะใช้ auth email

หลักสำคัญ:

- อย่า copy secret จากโปรเจคอื่นมาใช้ซ้ำ
- ทุกโปรเจคควรมี secret คนละชุด

## Step 5: สร้าง `ANON_KEY` และ `SERVICE_ROLE_KEY`

สองค่านี้ต้อง sign ด้วย `JWT_SECRET` ของโปรเจคนั้น

ต้องใช้ secret ของโปรเจคใหม่เท่านั้น

ห้ามใช้ของโปรเจคเก่า

## Step 6: กำหนด port ไม่ให้ชนกับโปรเจคเดิม

ตัวอย่าง:

- Project A:
  - Studio `3000`
  - API/Kong `8000`
  - DB pooler `5432/6543`

- Project B:
  - Studio `3100`
  - API/Kong `8100`
  - DB pooler `5532/6643`

ถ้า port ชนกัน container จะขึ้นไม่ครบ

## Step 7: รัน stack

ตัวอย่าง:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.pg17.yml up -d
```

## Step 8: ตรวจ health

เช็ก:

```bash
sudo docker compose ps
```

สิ่งที่ควรขึ้น:

- `db`
- `auth`
- `rest`
- `storage`
- `studio`
- `kong`
- `meta`
- `supavisor`
- `realtime`

สถานะควรเป็น `Up` และหลายตัวควรขึ้น `healthy`

## Step 9: เข้า Studio

เปิดจากเครื่องที่เข้าถึง VM ได้ เช่น:

```text
http://<ubuntu-vm-ip>:<studio-or-kong-port>
```

ถ้ามี reverse proxy หรือ domain ก็ใช้ domain ที่ map ไว้แทน

## Step 10: สร้าง schema/table/storage bucket สำหรับระบบใหม่

กรณีสร้างระบบใหม่จริง:

- สร้าง tables
- สร้าง RLS
- สร้าง policies
- สร้าง buckets
- ตั้ง auth providers
- ตั้ง SMTP

## Step 11: ผูกแอปเข้ากับ self-hosted project ใหม่นี้

ฝั่งแอปให้แก้ env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

และตรวจ:

- image domains
- CSP
- cron jobs
- worker scripts
- deployment env

## Step 12: ทดสอบจริง

อย่างน้อยต้องทดสอบ:

- login
- insert/update/delete
- file upload
- file read
- storage public URL
- auth reset password ถ้าใช้งาน
- cron/background jobs

---

## 6. ถ้ามีอีกระบบหนึ่งที่ตอนนี้อยู่บน Supabase Cloud แล้วจะย้ายมา local แบบนี้อีก ต้องทำอย่างไร

อันนี้คือ playbook สำหรับ "Cloud -> Self-hosted"

## Phase A: สำรวจระบบต้นทางก่อน

ก่อนย้าย ต้องรู้ให้ครบว่า cloud project นั้นใช้อะไรอยู่บ้าง

อย่างน้อยต้องสำรวจ:

- project ref
- direct DB host
- pooler host
- PostgreSQL version
- schemas ที่ใช้งาน
- auth users
- storage buckets
- storage objects
- edge functions
- cron jobs
- external integrations
- webhook destinations

ถ้าไม่สำรวจตรงนี้ก่อน จะย้ายแค่ตารางแต่ลืม auth หรือ storage ได้ง่าย

## Phase B: เตรียม self-hosted project ปลายทาง

มี 2 ทางเลือก:

### ทางเลือก 1: ใช้ self-hosted stack ใหม่แยกโปรเจค

เหมาะกว่า ถ้าเป็นอีกระบบคนละก้อน

### ทางเลือก 2: ใช้ stack เดิม แต่ restore ทับทั้งหมด

เหมาะเฉพาะกรณี:

- local โปรเจคนี้ตั้งใจแทน cloud project เดิมตรง ๆ
- ไม่มีระบบอื่นปะปน

ถ้าเป็นคนละระบบ อย่า restore ทับ stack เดิม

## Phase C: dump database จาก Cloud

### กรณี direct host ใช้ได้

ใช้ direct host ได้ ถ้า network รองรับ IPv6 หรือมี IPv4 add-on

### กรณี direct host ใช้ไม่ได้

ในเคสนี้เราเจอ direct host ใช้ IPv6 แล้ว VM นี้ออก IPv6 ไม่ได้

ดังนั้นใช้ pooler host แทน

ข้อควรจำ:

- dump ขนาดใหญ่ควรใช้ session/shared pooler ที่รองรับงานลักษณะนี้
- transaction pooler บางกรณีไม่เหมาะกับงานยาว
- ต้องดู connection string จาก project ที่จะย้ายจริง ไม่ใช่ project เก่า

ตัวอย่างรูปแบบ:

```text
postgresql://postgres.<project-ref>:[PASSWORD-URL-ENCODED]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

## Phase D: ใช้ `pg_dump` version ให้ตรง

ถ้า Cloud เป็น PG17 ให้ใช้ `postgres:17` image มารัน `pg_dump`

ตัวอย่าง:

```bash
sudo docker run --rm \
  -v "$PWD:/work" \
  postgres:17 \
  pg_dump 'postgresql://postgres.<project-ref>:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  --verbose \
  -f /work/project_dump.sql
```

## Phase E: restore เข้า local

แนวทางทั่วไป:

```bash
sudo docker exec -i <local-db-container> psql -U postgres -d postgres < project_dump.sql
```

หลัง restore ต้องตรวจทันที:

- schemas ครบไหม
- tables ครบไหม
- auth data มาครบไหม
- bucket metadata มาครบไหม

## Phase F: ย้าย Storage files

สำคัญมาก:

database dump อย่างเดียวไม่พอสำหรับไฟล์

เพราะ object metadata กับ physical files เป็นคนละชั้น

ดังนั้นต้องย้าย:

1. buckets metadata
2. objects metadata
3. physical files

วิธีที่ใช้ได้จริง:

- ใช้ service role ของ cloud อ่านไฟล์
- ใช้ service role ของ self-hosted upload เข้า bucket ปลายทาง
- วนทีละ bucket ทีละ file

หลังจบต้องตรวจ:

```sql
select id, name, public from storage.buckets order by name;
select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;
```

## Phase G: เปลี่ยนแอปให้ชี้ local

ใน repo ของระบบนั้น ๆ ให้เปลี่ยน:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

และต้องไล่เช็กเพิ่ม:

- `next.config.js`
- image host allowlist
- CSP
- cron
- worker scripts
- deployment env
- CI/CD env

## Phase H: verify แบบ end-to-end

อย่างน้อยต้องตรวจ:

- login ได้
- query ได้
- insert/update/delete ได้
- storage upload/download ได้
- รูปขึ้นในหน้า UI ทุกหน้าที่ใช้งานจริง
- reports/export ยังทำงาน
- jobs/background workers ยังทำงาน

## Phase I: freeze Cloud writes

ก่อนลบ Cloud ต้องทำให้แน่ใจว่าไม่มี process ไหนเขียนกลับเข้า Cloud แล้ว

ต้องเช็ก:

- repo env
- server env
- deploy env
- scheduled jobs
- scripts ภายนอก
- automation connectors

## Phase J: backup local ก่อนปิด Cloud

ห้ามลบ Cloud ก่อนที่จะมี backup local รอบล่าสุด

อย่างน้อยควรมี:

- DB dump local
- storage backup local
- copy ของ `.env` เก็บใน secret manager ที่ปลอดภัย

## Phase K: รอ observation period

อย่าลบ Cloud ทันทีหลัง cutover

ควรรอช่วงสังเกตการณ์ก่อน เช่น:

- 3 วัน
- 7 วัน
- 14 วัน

ขึ้นกับความเสี่ยงของระบบ

## Phase L: ค่อย decommission Cloud

เมื่อมั่นใจแล้วว่า:

- app ทุกตัวชี้ local
- ไม่มี write เข้า Cloud
- local backup พร้อม
- user ใช้งานจริงได้

ค่อยลบหรือปิด Cloud project

---

## 7. ถ้าจะเอาอีกหลายโปรเจคมาอยู่ใน local เครื่องเดียว ต้องรู้อะไรบ้าง

คำตอบคือ "ทำได้" แต่ต้องทำแบบมีวินัย

### สิ่งที่ต้องแยกต่อโปรเจค

- compose folder
- `.env`
- JWT secret
- anon key
- service role key
- DB password
- storage volume
- exposed ports
- backup destination
- domain/subdomain

### สิ่งที่ต้องเฝ้าทรัพยากร

- RAM
- disk growth
- docker logs
- storage growth
- backup size
- CPU spikes

### แนวทางที่แนะนำ

ถ้ามีหลายโปรเจคจริง ควรมีอย่างน้อย:

- reverse proxy กลาง 1 ตัว
- subdomain แยกต่อโปรเจค
- backup script แยกต่อโปรเจค
- monitoring พื้นฐาน

ตัวอย่าง:

- `supabase-sales.local`
- `supabase-hr.local`
- `supabase-wh.local`

หรือภายใน LAN:

- `sales.example.local`
- `hr.example.local`

### ไม่แนะนำ

- เอาหลายระบบคนละโดเมนงานมายัดลง DB เดียว ถ้าไม่ได้ตั้งใจออกแบบตั้งแต่ต้น
- ใช้ secrets ชุดเดียวกันทุกโปรเจค
- ใช้ ports ซ้ำ
- ใช้ storage volume ปนกัน

---

## 8. สิ่งที่ต้องทำต่อหลัง migration เสร็จ

แม้ migration หลักจะเสร็จแล้ว แต่ operational work ยังมี

## 8.1 จัดการ secrets ให้เป็นระเบียบ

เพราะระหว่าง migration มีการใช้ connection strings และ keys หลายชุด

หลังระบบนิ่งแล้วควร:

- rotate passwords/keys ที่จำเป็น
- ย้าย secrets ไปไว้ secret manager หรือที่เก็บปลอดภัย
- ล้างค่า secret จริงออกจากไฟล์ที่ไม่ควร commit

## 8.2 ทำ backup plan

อย่างน้อยควรมี:

- daily DB dump
- storage backup
- retain backups ตามช่วงเวลา
- restore test เป็นระยะ

## 8.3 ทำ monitoring

อย่างน้อยควรเฝ้า:

- docker container health
- disk usage
- DB size
- memory pressure
- reverse proxy errors
- login/auth failures

## 8.4 จด inventory ให้ครบ

ควรมีเอกสารแยกอีกไฟล์หรือเพิ่มท้ายไฟล์นี้ว่า:

- โปรเจคไหนใช้ host อะไร
- port อะไร
- domain อะไร
- backup path อะไร
- ใครดูแล

---

## 9. Checklist สำหรับ "จะลบ Supabase Cloud ได้หรือยัง"

เช็กทีละข้อ:

- [ ] แอปทุกตัวชี้ self-hosted แล้ว
- [ ] deployment env จริงชี้ self-hosted แล้ว
- [ ] cron/jobs/workers ไม่เขียนเข้า Cloud แล้ว
- [ ] DB local มีข้อมูลครบ
- [ ] Storage local มีไฟล์ครบ
- [ ] auth ใช้งานได้จริง
- [ ] หน้า UI ที่ใช้รูปทั้งหมดทดสอบแล้ว
- [ ] backup local รอบล่าสุดมีแล้ว
- [ ] มีช่วง observation หลัง cutover แล้ว

ถ้ายังตอบไม่ได้แม้แต่ข้อเดียวว่า "ใช่" อย่าเพิ่งลบ Cloud

---

## 10. Checklist สำหรับ "จะย้ายอีกโปรเจคจาก Cloud มา local"

- [ ] รู้ project ref ที่ถูกต้อง
- [ ] รู้ direct host และ pooler host
- [ ] รู้ PostgreSQL version ของ source
- [ ] เตรียม local stack ปลายทางแล้ว
- [ ] ใช้ `pg_dump` version ตรงกับ source
- [ ] dump DB สำเร็จ
- [ ] restore local สำเร็จ
- [ ] ตรวจ schemas/tables สำเร็จ
- [ ] ย้าย storage files สำเร็จ
- [ ] ตรวจ `storage.objects` สำเร็จ
- [ ] แก้ repo env ไป self-hosted แล้ว
- [ ] แก้ deployment env แล้ว
- [ ] ทดสอบ login/query/upload/download แล้ว
- [ ] freeze cloud writes แล้ว
- [ ] local backup พร้อมแล้ว

---

## 11. สิ่งที่ยังค้างอยู่ใน repo นี้

สำหรับ repo ปัจจุบัน สิ่งที่ค้างไม่ใช่ migration blocker แต่เป็นงานคุณภาพโค้ด:

- ยังมี TypeScript errors เดิมหลายจุดในโปรเจค
- ควรไล่ปิดทีละ issue ภายหลัง

แต่ในมุม migration สถานะถือว่า:

- self-hosted ใช้งานได้
- DB ย้ายแล้ว
- Storage ย้ายแล้ว
- app ชี้ local แล้ว

---

## 12. คำตอบตรง ๆ สำหรับคำถามสำคัญ

### Q1: local เครื่องเดียวมีหลายโปรเจคได้ไหม

ได้

แต่ควรแยก stack, ports, env, volumes, backups ให้ชัดเจนต่อโปรเจค

### Q2: ถ้าจะสร้างโปรเจคใหม่เลยบน local ต้องทำอย่างไร

ให้สร้าง self-hosted stack ใหม่อีกชุดสำหรับโปรเจคนั้น แล้วผูกแอปไปหาชุดนั้น

### Q3: ถ้ามีระบบบน Supabase Cloud อีกตัวแล้วจะย้ายมา local ต้องทำอย่างไร

ให้ทำตาม playbook "Cloud -> Self-hosted":

- สร้าง stack ปลายทาง
- dump DB
- restore DB
- migrate storage files
- เปลี่ยน env ของแอป
- verify
- freeze cloud writes
- backup
- ค่อยปิด Cloud

### Q4: ตอนนี้ของระบบนี้ถือว่าเสร็จหรือยัง

ถ้ามองเฉพาะ migration หลัก:

เสร็จแล้ว

ถ้ามองงานปิดโปรเจคแบบ production-grade:

ยังควรทำต่ออีก 3 เรื่อง:

1. ยืนยัน deployment/runtime env ฝั่งที่รันจริงทุกตัว
2. ตั้ง backup/monitoring
3. รอ observation period ก่อนลบ Cloud

---

## 13. ลำดับแนะนำถ้าจะทำโปรเจคถัดไป

ถ้าคุณจะเอาโปรเจคใหม่เข้ามาอีก ผมแนะนำให้ใช้ลำดับนี้ทุกครั้ง:

1. แยกว่าเป็น "โปรเจคใหม่" หรือ "ย้ายจาก Cloud"
2. สร้าง stack แยกของโปรเจคนั้นก่อน
3. ตั้ง secrets ใหม่ทั้งหมด
4. ตั้ง ports/domain ไม่ให้ชน
5. ถ้าเป็น Cloud migration ค่อย dump/restore
6. ย้าย storage files
7. เปลี่ยน env ฝั่งแอป
8. ทดสอบ end-to-end
9. freeze cloud writes
10. backup
11. รอ observation
12. ค่อย decommission cloud

---

## 14. หมายเหตุสุดท้าย

สิ่งที่ทำสำเร็จในรอบนี้ ไม่ได้แปลว่าควร copy ทั้งชุดแบบไม่คิด

เวลาทำโปรเจคถัดไป ต้องเช็ก 5 เรื่องนี้ทุกครั้ง:

1. project ref ถูกไหม
2. host ที่ใช้ dump ถูกไหม
3. PostgreSQL version ตรงไหม
4. storage ย้ายครบไหม
5. runtime env ทุกจุดชี้ local จริงไหม

ถ้าพลาดข้อใดข้อหนึ่ง มักจะเกิดอาการแบบนี้:

- dump ออกมาจาก project ผิด
- restore ได้แต่ข้อมูลไม่ครบ
- รูปไม่ขึ้น
- app บางส่วนยังเขียนเข้า Cloud
- local ดูเหมือนใช้ได้ แต่ production ยังวิ่งที่ Cloud

ดังนั้นเวลาทำโปรเจคถัดไป ให้ถือเอกสารนี้เป็น runbook หลัก แล้วค่อยแตก checklist รายโปรเจคเพิ่มอีกชั้น

