# Sunmi V3 Implementation Journal

อัปเดตล่าสุด: `2026-02-19 16:56:15`

## 1) เป้าหมายงาน

ทำให้ระบบ `Daily Work` บน PWA/เว็บ สามารถพิมพ์ใบงานผ่านเครื่องพิมพ์ในตัว `SUNMI V3` ได้จริงแบบเสถียร และโค้ดต้องแยกชัดเจน ดูแลง่าย รองรับการต่อยอดในอนาคต

---

## 2) สรุปสิ่งที่ทำไปแล้ว (ตั้งแต่เริ่มงานรอบนี้)

### 2.1 ฝั่งเว็บ (Next.js)

1. แยก logic พิมพ์ตรงออกจากหน้า UI ไปเป็นโมดูลกลาง
   - `src/features/printing/sunmiDirectPrintClient.js`
2. ออกแบบ flow พิมพ์แบบลำดับ:
   - Android bridge ก่อน (`window.AndroidPrinter` / `window.SunmiPrinter` / `window.Android`)
   - Sunmi JS SDK เป็น fallback
   - ถ้าพิมพ์ตรงไม่ได้ ค่อย fallback ไป browser print
3. ปรับ `DailyWorkForm` ให้เรียก service กลางตัวเดียว
   - `src/app/production-line/attendance/daily-scan/DailyWorkForm.js`
4. เพิ่ม reason code สำหรับ debug และ UX ที่ชัดเจน
   - `sunmi-direct-unavailable`
   - `sunmi-direct-failed`
5. เก็บ payload print format ให้เป็น contract เดียว
   - `type: "daily_work_slip"`
   - `version: 1`
   - `source: "production-line-web"`

### 2.2 ฝั่งเอกสารระบบพิมพ์

1. เพิ่มเอกสารแนวทาง production
   - `docs/sunmi-v3-direct-print.md`
2. เอกสารครอบคลุม:
   - Architecture
   - Payload contract
   - แนวทาง security ของ WebView/bridge
   - Checklist ก่อนใช้งานจริง

### 2.3 ฝั่ง Android Wrapper (ใหม่ทั้งชุด)

สร้างโปรเจกต์ใหม่:
- `android/sunmi-v3-wrapper`

โครงสำคัญที่เพิ่ม:
1. Gradle project + app module
   - `android/sunmi-v3-wrapper/settings.gradle.kts`
   - `android/sunmi-v3-wrapper/build.gradle.kts`
   - `android/sunmi-v3-wrapper/app/build.gradle.kts`
2. MainActivity (WebView shell + security + permission)
   - `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/MainActivity.kt`
3. JavaScript bridge
   - `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/bridge/AndroidPrinterBridge.kt`
4. Sunmi printer manager
   - `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/print/SunmiPrinterManager.kt`
5. Manifest/Resources
   - `android/sunmi-v3-wrapper/app/src/main/AndroidManifest.xml`
   - `android/sunmi-v3-wrapper/app/src/main/res/layout/activity_main.xml`
   - `android/sunmi-v3-wrapper/app/src/main/res/values/*.xml`
   - `android/sunmi-v3-wrapper/app/src/main/res/xml/network_security_config.xml`
6. คู่มือ build/run
   - `android/sunmi-v3-wrapper/README.md`

### 2.4 ค่าที่ตั้งให้แล้วตาม production domain

1. `web_app_url` ตั้งเป็น:
   - `https://production.kpfoods.co.th/production-line/attendance/daily-scan`
   - ไฟล์: `android/sunmi-v3-wrapper/app/src/main/res/values/strings.xml`
2. `trusted_web_hosts` ตั้งเป็น:
   - `production.kpfoods.co.th`
   - ไฟล์: `android/sunmi-v3-wrapper/app/src/main/res/values/arrays.xml`

---

## 3) ปัญหาที่เจอและสิ่งที่แก้แล้ว

1. `fetchGatewayJson is not defined` (ก่อนหน้า)
   - แก้ flow/การเรียก API ฝั่ง daily scan แล้ว
2. Scanner error:
   - `Cannot transition to a new state, already under transition`
   - `cameraIdOrConfig ... found 4 keys`
   - ปรับ logic scanner lifecycle แล้ว
3. ภาษาไทยเพี้ยน (mojibake)
   - แก้ข้อความในไฟล์ที่เกี่ยวข้องแล้ว
4. Build Android fail รอบแรก:
   - `Null can not be a value of a non-null type WebViewClient`
   - `Unresolved reference: BuildConfig`
   - แก้ใน `MainActivity.kt` แล้ว และ build ผ่าน

---

## 4) สถานะตรวจสอบล่าสุด

### ฝั่งเว็บ

1. `npm run lint` ผ่าน
2. `npm run build` ผ่าน (Next.js production build สำเร็จ)

### ฝั่ง Android Wrapper

1. `:app:assembleDebug` ผ่าน
2. สถานะล่าสุดจากผู้ใช้งาน:
   - `BUILD SUCCESSFUL`

---

## 5) สิ่งที่ “ยังไม่จบ” ตอนนี้

โค้ดเสร็จแล้ว แต่ยังต้องทำ deployment ลงเครื่องจริง:

1. เชื่อมต่อ SUNMI V3 กับคอมให้ ADB เห็นเครื่อง
2. กด `Run` จาก Android Studio เพื่อติดตั้งแอปลงเครื่อง
3. ทดสอบ end-to-end จริง:
   - สแกน QR
   - บันทึกงาน
   - พิมพ์ออกเครื่องในตัว SUNMI

---

## 6) แผนถัดไป (กำลังจะทำ)

### ขั้นตอนทันที (Priority สูง)

1. แก้ปัญหาเครื่องไม่โผล่ใน Device Manager/ADB
   - ตรวจสาย data
   - เปิด USB debugging
   - ตั้ง USB mode เป็น File transfer
   - ยืนยัน authorization popup
2. ติดตั้ง app ลง SUNMI V3
3. ทดสอบใบพิมพ์จริงกระดาษ 57x40 mm
4. เก็บผลทดสอบ (ผ่าน/ไม่ผ่าน + รูปใบพิมพ์)

### ขั้นตอนหลังจากติดตั้งสำเร็จ (Future Hardening)

1. ทำ release signing (keystore จริง)
2. แยก build flavor (`dev`/`prod`)
3. เพิ่ม logging ฝั่ง Android เฉพาะ print failure
4. เพิ่ม retry/rebind strategy ของ printer service
5. วางแผน distribution ผ่าน MDM (ถ้าหน้างานต้องใช้หลายเครื่อง)

---

## 7) สิ่งที่ “ไม่ได้แตะ” ในรอบนี้

1. ไม่มี migration ใหม่ใน Supabase
2. ไม่มีแก้ schema database
3. ไม่มีเปลี่ยน business logic ฝั่งคำนวณค่าจ้าง/หน่วยใน DB

---

## 8) Contract สำคัญที่ต้องคงไว้

ฝั่งเว็บจะส่ง JSON ไป bridge ตามนี้:

```json
{
  "type": "daily_work_slip",
  "version": 1,
  "source": "production-line-web",
  "data": {
    "workTypeName": "...",
    "employeeCode": "...",
    "employeeName": "...",
    "amountText": "...",
    "valueLabel": "...",
    "unitLabel": "...",
    "timeText": "...",
    "dateText": "..."
  }
}
```

ถ้าแก้ payload นี้ในอนาคต ต้องแก้ทั้ง:
1. `src/features/printing/sunmiDirectPrintClient.js`
2. `android/sunmi-v3-wrapper/.../AndroidPrinterBridge.kt`
3. `android/sunmi-v3-wrapper/.../SunmiPrinterManager.kt`

---

## 9) ไฟล์หลักที่เกี่ยวข้องทั้งหมด

1. `src/features/printing/sunmiDirectPrintClient.js`
2. `src/app/production-line/attendance/daily-scan/DailyWorkForm.js`
3. `docs/sunmi-v3-direct-print.md`
4. `android/sunmi-v3-wrapper/README.md`
5. `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/MainActivity.kt`
6. `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/bridge/AndroidPrinterBridge.kt`
7. `android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/print/SunmiPrinterManager.kt`
8. `android/sunmi-v3-wrapper/app/src/main/res/values/strings.xml`
9. `android/sunmi-v3-wrapper/app/src/main/res/values/arrays.xml`
