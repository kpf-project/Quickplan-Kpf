# Sunmi V3 Wrapper (WebView + Direct Printer)

โปรเจกต์นี้เป็น Android wrapper สำหรับรันเว็บ Production Line บน Sunmi V3 และพิมพ์ตรงผ่านเครื่องพิมพ์ในตัวเครื่อง

## เป้าหมาย

1. ใช้งานหน้าเว็บเดิมได้ครบ (รวมกล้องสแกน QR)
2. พิมพ์ใบบันทึกงานโดยตรงผ่าน `AndroidPrinter.printReceipt(...)`
3. ไม่เด้ง dialog เลือกเครื่องพิมพ์ใน flow ปกติ

## โครงสร้างสำคัญ

1. `app/src/main/java/com/kpf/productionline/sunmiwrapper/MainActivity.kt`
   โหลดเว็บผ่าน WebView + security + camera permission
2. `app/src/main/java/com/kpf/productionline/sunmiwrapper/bridge/AndroidPrinterBridge.kt`
   JavaScript bridge method:
   - `printReceipt(payloadJson)`
   - `printDailyWorkSlip(payloadJson)`
   - `printSlip(payloadJson)`
3. `app/src/main/java/com/kpf/productionline/sunmiwrapper/print/SunmiPrinterManager.kt`
   จัดการ bind/unbind และสั่งพิมพ์ผ่าน `com.sunmi:printerlibrary:1.0.18`

## การตั้งค่าก่อน build

แก้ไฟล์:

1. `app/src/main/res/values/strings.xml`
   - `web_app_url` ให้เป็น URL production ของเว็บ
2. `app/src/main/res/values/arrays.xml`
   - `trusted_web_hosts` ให้ตรง domain ที่อนุญาต

ตัวอย่าง:

```xml
<string name="web_app_url">https://prod.kpf.co.th/production-line/attendance/daily-scan</string>
```

```xml
<string-array name="trusted_web_hosts">
  <item>prod.kpf.co.th</item>
</string-array>
```

## Build และติดตั้ง (Android Studio)

1. เปิดโฟลเดอร์ `android/sunmi-v3-wrapper` ใน Android Studio
2. รอ Gradle sync ให้เสร็จ
3. ต่อเครื่อง Sunmi V3 ด้วย USB debugging
4. กด Run app

ถ้าต้องการผ่าน command line:

```bash
cd android/sunmi-v3-wrapper
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## วิธีทดสอบพิมพ์ตรง

1. เปิดแอป wrapper บน Sunmi V3
2. ไปหน้า Daily Work แล้วบันทึกงาน
3. กดพิมพ์
4. ควรพิมพ์ออกเครื่องทันทีโดยไม่ขึ้น print chooser

## Contract จากเว็บ (ต้องตรง)

Bridge รองรับ payload แบบ:

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
    "dateText": "...",
    "logoScale": 0.52
  }
}
```

`logoScale` เป็น optional: ช่วงที่รองรับ `0.2 - 1.5` (ค่า default `0.52`)

## หมายเหตุ production

1. ห้ามอนุญาต host ที่ไม่จำเป็นใน `trusted_web_hosts`
2. อย่าใช้ `http://` สำหรับหน้าเว็บจริง
3. ถ้าต้องใช้ kiosk mode/auto-launch ให้ตั้งในระดับ MDM ของ Sunmi
