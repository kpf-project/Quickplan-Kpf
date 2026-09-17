# Sunmi V3 Direct Print (Production Ready)

เอกสารนี้อธิบายแนวทางพิมพ์ใบงานจากหน้า Daily Work ให้พิมพ์ออกเครื่อง Sunmi V3 ได้จริงโดยไม่ต้องเลือกเครื่องพิมพ์ทุกครั้ง

โค้ด wrapper ตัวอย่างพร้อมใช้งานอยู่ที่ `android/sunmi-v3-wrapper/`

## 1) สถาปัตยกรรมที่ใช้งานจริง

1. เว็บหน้า Daily Work เรียก `printDailyWorkSlipDirect(slip)` ที่ `src/features/printing/sunmiDirectPrintClient.js`
2. ฝั่งเว็บพยายามพิมพ์ผ่าน Android bridge ก่อน (`window.AndroidPrinter.printReceipt(...)`)
3. หากไม่พบ bridge จะ fallback ไป Sunmi JS SDK
4. หากยังพิมพ์ไม่ได้:
   - บน Sunmi: จะแจ้งให้ผู้ใช้ตัดสินใจว่าจะ fallback เป็น browser print หรือไม่
   - บนอุปกรณ์อื่น: fallback ไป browser print ตามเดิม

แนวทางนี้รองรับทั้งปัจจุบัน (ยังไม่มี wrapper) และอนาคต (มี wrapper แล้วจะพิมพ์ตรงทันที)

## 2) Payload Contract ระหว่าง Web -> Native

ฝั่งเว็บส่ง JSON รูปแบบเดียวเสมอ:

```json
{
  "type": "daily_work_slip",
  "version": 1,
  "source": "production-line-web",
  "data": {
    "workTypeName": "แพ็คสินค้า",
    "employeeCode": "KPF-01774",
    "employeeName": "สมชาย ใจดี",
    "amountText": "120.00",
    "valueLabel": "จำนวน",
    "unitLabel": "กิโลกรัม",
    "timeText": "14:15:03",
    "dateText": "19/02/2569"
  }
}
```

## 3) Android Wrapper ที่แนะนำ (มาตรฐานจริง)

ใช้ Android app (WebView wrapper) เพื่อเรียก Sunmi printer service โดยตรง

### 3.1 Dependencies

```gradle
dependencies {
  implementation "com.sunmi:printerlibrary:1.0.18"
}
```

### 3.2 WebView Security (สำคัญ)

- เปิด bridge เฉพาะเว็บโดเมนที่เชื่อถือได้
- ปิด file/content access ที่ไม่จำเป็น
- ไม่โหลด `http://` (อนุญาตเฉพาะ `https://`)

```kotlin
webView.settings.javaScriptEnabled = true
webView.settings.allowFileAccess = false
webView.settings.allowContentAccess = false
webView.settings.domStorageEnabled = true
webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
```

### 3.3 MainActivity (ตัวอย่าง)

```kotlin
class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView
  private lateinit var printer: SunmiPrinterManager

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    webView = findViewById(R.id.webview)
    printer = SunmiPrinterManager(this)

    configureWebView()
    webView.loadUrl("https://your-production-line-domain")
  }

  override fun onStart() {
    super.onStart()
    printer.bind()
  }

  override fun onStop() {
    super.onStop()
    printer.unbind()
  }

  private fun configureWebView() {
    webView.settings.javaScriptEnabled = true
    webView.settings.allowFileAccess = false
    webView.settings.allowContentAccess = false
    webView.settings.domStorageEnabled = true
    webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val host = request?.url?.host ?: return true
        val scheme = request.url?.scheme ?: ""
        val trustedHost = host == "your-production-line-domain"
        val trustedScheme = scheme == "https"
        return !(trustedHost && trustedScheme)
      }
    }

    webView.addJavascriptInterface(
      AndroidPrinterBridge(printer),
      "AndroidPrinter"
    )
  }
}
```

### 3.4 JavaScript Interface (ตัวอย่าง)

```kotlin
class AndroidPrinterBridge(
  private val printer: SunmiPrinterManager
) {
  @JavascriptInterface
  fun printReceipt(payloadJson: String): String {
    return try {
      val payload = JSONObject(payloadJson)
      val type = payload.optString("type")
      if (type != "daily_work_slip") {
        return "error:unsupported_type"
      }

      val data = payload.optJSONObject("data") ?: return "error:missing_data"
      printer.printDailyWorkSlip(data)
      "ok"
    } catch (ex: Exception) {
      "error:${ex.message ?: "unknown"}"
    }
  }
}
```

### 3.5 Sunmi Printer Manager (ตัวอย่าง)

```kotlin
class SunmiPrinterManager(private val context: Context) {
  private var service: SunmiPrinterService? = null

  private val callback = object : InnerPrinterCallback() {
    override fun onConnected(svc: SunmiPrinterService?) {
      service = svc
    }
    override fun onDisconnected() {
      service = null
    }
  }

  fun bind() {
    InnerPrinterManager.getInstance().bindService(context, callback)
  }

  fun unbind() {
    InnerPrinterManager.getInstance().unBindService(context, callback)
  }

  fun printDailyWorkSlip(data: JSONObject) {
    val printer = service ?: throw IllegalStateException("printer_not_connected")

    val workType = data.optString("workTypeName", "-")
    val code = data.optString("employeeCode", "-")
    val name = data.optString("employeeName", "-")
    val valueLabel = data.optString("valueLabel", "จำนวน")
    val amount = data.optString("amountText", "-")
    val unit = data.optString("unitLabel", "หน่วย")
    val time = data.optString("timeText", "-")
    val date = data.optString("dateText", "-")

    printer.printerInit(null)
    printer.setAlignment(1, null)
    printer.printText("ใบบันทึกงาน\n", null)
    printer.setAlignment(0, null)
    printer.printText("ประเภทงาน: $workType\n", null)
    printer.printText("รหัส-ชื่อ: $code - $name\n", null)
    printer.printText("$valueLabel: $amount $unit\n", null)
    printer.printText("เวลา: $time\n", null)
    printer.printText("วันที่: $date\n", null)
    printer.lineWrap(3, null)
  }
}
```

## 4) ขั้นตอนรันจริง (Sunmi V3)

1. Build และ deploy เว็บเวอร์ชันล่าสุด
2. สร้าง Android wrapper และตั้ง trusted domain ให้ตรงกับ production
3. ติดตั้ง APK บน Sunmi V3
4. เปิดแอป wrapper แล้วเข้าหน้า Daily Work
5. บันทึกงานและกดพิมพ์
6. ตรวจว่าไม่ขึ้น dialog เลือกเครื่องพิมพ์ และพิมพ์ออกทันทีจากเครื่อง Sunmi

## 5) Checklist ก่อนขึ้นใช้งานจริง

1. Wrapper โหลดได้เฉพาะ `https://` และ host ที่อนุญาต
2. `@JavascriptInterface` มีเฉพาะ method ที่จำเป็น
3. ฝั่งเว็บส่ง payload ตาม `version: 1`
4. ทดสอบ network ช้า/หลุด แล้วระบบยังไม่ค้าง
5. ทดสอบกรณี printer service ยังไม่ bind และแจ้ง error ชัดเจน
6. ทดสอบกระดาษจริง 57x40 mm และตรวจข้อความครบทุกฟิลด์

## 6) หมายเหตุสำคัญ

- PWA ใน browser ปกติไม่สามารถควบคุมเครื่องพิมพ์ Sunmi ภายในได้โดยตรงเหมือน native app
- ถ้าต้องการความเสถียรระดับ production บน Sunmi V3 ควรใช้ Android wrapper + bridge เป็นช่องทางหลัก
