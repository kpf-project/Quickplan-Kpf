package com.kpf.productionline.sunmiwrapper.print

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.SystemClock
import android.util.Log
import com.kpf.productionline.sunmiwrapper.R
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.SunmiPrinterService
import org.json.JSONObject
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

data class PrintResult(
  val ok: Boolean,
  val statusCode: Int? = null,
  val modeCode: Int? = null,
  val paperCode: Int? = null,
  val reason: String? = null
)

class SunmiPrinterManager(
  private val context: Context
) {
  @Volatile
  private var printerService: SunmiPrinterService? = null

  @Volatile
  private var isBound = false

  private val printLock = ReentrantLock()

  private val connectionCallback = object : InnerPrinterCallback() {
    override fun onConnected(service: SunmiPrinterService?) {
      printerService = service
      Log.i(TAG, "Sunmi printer connected")
    }

    override fun onDisconnected() {
      printerService = null
      Log.w(TAG, "Sunmi printer disconnected")
    }
  }

  fun bind() {
    if (isBound) return
    try {
      val connected = InnerPrinterManager.getInstance().bindService(context, connectionCallback)
      isBound = connected
      if (!connected) {
        Log.w(TAG, "bindService returned false")
      }
    } catch (error: Exception) {
      Log.e(TAG, "bind failed", error)
    }
  }

  fun unbind() {
    if (!isBound) return
    try {
      InnerPrinterManager.getInstance().unBindService(context, connectionCallback)
    } catch (error: Exception) {
      Log.e(TAG, "unbind failed", error)
    } finally {
      isBound = false
      printerService = null
    }
  }

  fun printDailyWorkSlip(data: JSONObject): PrintResult {
    val workType = data.optString("workTypeName", "-")
    val employeeCode = data.optString("employeeCode", "-")
    val employeeName = data.optString("employeeName", "-")
    val valueLabel = data.optString("valueLabel", "จำนวน")
    val amountText = data.optString("amountText", "-")
    val unitLabel = data.optString("unitLabel", "หน่วย")
    val timeText = data.optString("timeText", "-")
    val dateText = data.optString("dateText", "-")
    val docNo = data.optString("docNo", "-")
    val machineCode = data.optString("machineCode", "-")
    val sizeValue = data.optString("sizeValue", "-")
    val fillingValue = data.optString("fillingValue", "-")
    val operatorUsername = data.optString("operatorUsername", "-")
    val logoScale = sanitizeLogoScale(data.optDouble("logoScale", DEFAULT_LOGO_SCALE.toDouble()))
    Log.i(TAG, "printDailyWorkSlip logoScale=$logoScale")

    return printLock.withLock {
      repeat(MAX_PRINT_ATTEMPTS) { attempt ->
        val attemptIndex = attempt + 1
        val service = awaitPrinterService(PRINTER_WAIT_TIMEOUT_MS)
        if (service == null) {
          Log.w(TAG, "attempt $attemptIndex: printer service unavailable")
          forceRebind()
          return@repeat
        }

        try {
          val status = service.updatePrinterState()
          val mode = runCatching { service.getPrinterMode() }.getOrNull()
          val paper = runCatching { service.getPrinterPaper() }.getOrNull()
          Log.i(
            TAG,
            "attempt $attemptIndex state: status=$status(${statusDescription(status)}), mode=$mode, paper=$paper"
          )

          if (!isPrintableStatus(status)) {
            return PrintResult(
              ok = false,
              statusCode = status,
              modeCode = mode,
              paperCode = paper,
              reason = "printer_state_${statusDescription(status)}"
            )
          }

          service.printerInit(null)
          service.setAlignment(1, null)
          val logo = loadPrintLogo(logoScale)
          if (logo != null) {
            service.printBitmap(logo, null)
            service.lineWrap(LOGO_TEXT_GAP_LINES, null)
          }
          service.printText("ใบบันทึกงาน\n", null)
          service.printText("เวลา: ${safeText(timeText)}\n", null)
          service.printText("วันที่: ${safeText(dateText)}\n", null)
          service.printText("เลขเอกสาร: ${safeText(docNo)}\n", null)
          service.printText("เครื่อง: ${safeText(machineCode)}\n", null)
          service.printText("--------------------------------\n", null)
          service.setAlignment(0, null)

          service.printText("ประเภทงาน : ${safeText(workType)}\n", null)
          service.printText("รหัส-ชื่อ : ${safeText(employeeCode)} - ${safeText(employeeName)}\n", null)
          service.printText("Size : ${safeText(sizeValue)}\n", null)
          service.printText("เนื้อขนม : ${safeText(fillingValue)}\n", null)
          service.printText("ผู้บันทึก : ${safeText(operatorUsername)}\n", null)
          service.printText("--------------------------------\n", null)
          service.printText("${safeText(valueLabel)} : ${safeText(amountText)} ${safeText(unitLabel)}\n", null)
          service.printText("--------------------------------\n", null)
          service.lineWrap(3, null)

          // Some devices behave more reliably with explicit paper out after text.
          runCatching { service.autoOutPaper(null) }
            .onFailure { Log.w(TAG, "autoOutPaper not available: ${it.message}") }

          Log.i(TAG, "printDailyWorkSlip success on attempt $attemptIndex")
          return PrintResult(
            ok = true,
            statusCode = status,
            modeCode = mode,
            paperCode = paper,
            reason = null
          )
        } catch (error: Exception) {
          Log.e(TAG, "attempt $attemptIndex failed", error)
          forceRebind()
        }
      }

      Log.e(TAG, "printDailyWorkSlip failed after $MAX_PRINT_ATTEMPTS attempts")
      PrintResult(ok = false, reason = "printer_unavailable")
    }
  }

  fun printPieceRateSlip(data: JSONObject): PrintResult {
    val productCode = data.optString("productCode", "-")
    val productName = data.optString("productName", "-")
    val brandName = data.optString("brandName", "-")
    val employeeCode = data.optString("employeeCode", "-")
    val employeeName = data.optString("employeeName", "-")
    val departmentName = data.optString("departmentName", "-")
    val branchName = data.optString("branchName", "-")
    val valueLabel = data.optString("valueLabel", "จำนวน")
    val amountText = data.optString("amountText", "-")
    val unitLabel = data.optString("unitLabel", "หน่วย")
    val timeText = data.optString("timeText", "-")
    val dateText = data.optString("dateText", "-")
    val docNo = data.optString("docNo", "-")
    val machineCode = data.optString("machineCode", "-")
    val operatorUsername = data.optString("operatorUsername", "-")
    val logoScale = sanitizeLogoScale(data.optDouble("logoScale", DEFAULT_LOGO_SCALE.toDouble()))

    return printLock.withLock {
      repeat(MAX_PRINT_ATTEMPTS) { attempt ->
        val attemptIndex = attempt + 1
        val service = awaitPrinterService(PRINTER_WAIT_TIMEOUT_MS)
        if (service == null) {
          Log.w(TAG, "piece-rate attempt $attemptIndex: printer service unavailable")
          forceRebind()
          return@repeat
        }

        try {
          val status = service.updatePrinterState()
          val mode = runCatching { service.getPrinterMode() }.getOrNull()
          val paper = runCatching { service.getPrinterPaper() }.getOrNull()
          Log.i(
            TAG,
            "piece-rate attempt $attemptIndex state: status=$status(${statusDescription(status)}), mode=$mode, paper=$paper"
          )

          if (!isPrintableStatus(status)) {
            return PrintResult(
              ok = false,
              statusCode = status,
              modeCode = mode,
              paperCode = paper,
              reason = "printer_state_${statusDescription(status)}"
            )
          }

          service.printerInit(null)
          service.setAlignment(1, null)
          val logo = loadPrintLogo(logoScale)
          if (logo != null) {
            service.printBitmap(logo, null)
            service.lineWrap(LOGO_TEXT_GAP_LINES, null)
          }
          service.printText("ใบบันทึกงาน\n", null)
          service.printText("เวลา: ${safeText(timeText)}\n", null)
          service.printText("วันที่: ${safeText(dateText)}\n", null)
          service.printText("เลขเอกสาร: ${safeText(docNo)}\n", null)
          service.printText("เครื่อง: ${safeText(machineCode)}\n", null)
          service.printText("--------------------------------\n", null)
          service.setAlignment(0, null)

          service.printText("สินค้า : ${safeText(productCode)} - ${safeText(productName)}\n", null)
          service.printText("แบรนด์ : ${safeText(brandName)}\n", null)
          service.printText("รหัส-ชื่อ : ${safeText(employeeCode)} - ${safeText(employeeName)}\n", null)
          service.printText("แผนก : ${safeText(departmentName)}\n", null)
          service.printText("สาขา : ${safeText(branchName)}\n", null)
          service.printText("ผู้บันทึก : ${safeText(operatorUsername)}\n", null)
          service.printText("--------------------------------\n", null)
          service.printText("${safeText(valueLabel)} : ${safeText(amountText)} ${safeText(unitLabel)}\n", null)
          service.printText("--------------------------------\n", null)
          service.lineWrap(3, null)

          runCatching { service.autoOutPaper(null) }
            .onFailure { Log.w(TAG, "autoOutPaper not available: ${it.message}") }

          Log.i(TAG, "printPieceRateSlip success on attempt $attemptIndex")
          return PrintResult(
            ok = true,
            statusCode = status,
            modeCode = mode,
            paperCode = paper,
            reason = null
          )
        } catch (error: Exception) {
          Log.e(TAG, "piece-rate attempt $attemptIndex failed", error)
          forceRebind()
        }
      }

      Log.e(TAG, "printPieceRateSlip failed after $MAX_PRINT_ATTEMPTS attempts")
      PrintResult(ok = false, reason = "printer_unavailable")
    }
  }

  fun printQtyBarcodeLabel(data: JSONObject): PrintResult {
    val barcodeValue = data.optString("barcodeValue", "").trim()
    if (barcodeValue.isBlank()) {
      return PrintResult(ok = false, reason = "missing_barcode_value")
    }

    val barcodeType = data.optString("barcodeType", "CODE128").trim().uppercase()
    if (barcodeType != "CODE128") {
      return PrintResult(ok = false, reason = "unsupported_barcode_type")
    }

    val label = data.optString("label", "PALLET")
    val humanText = data.optString("humanText", "")
    val copies = data.optInt("copies", 1).coerceIn(1, 20)

    return printLock.withLock {
      repeat(MAX_PRINT_ATTEMPTS) { attempt ->
        val attemptIndex = attempt + 1
        val service = awaitPrinterService(PRINTER_WAIT_TIMEOUT_MS)
        if (service == null) {
          Log.w(TAG, "barcode attempt $attemptIndex: printer service unavailable")
          forceRebind()
          return@repeat
        }

        try {
          val status = service.updatePrinterState()
          val mode = runCatching { service.getPrinterMode() }.getOrNull()
          val paper = runCatching { service.getPrinterPaper() }.getOrNull()
          Log.i(
            TAG,
            "barcode attempt $attemptIndex state: status=$status(${statusDescription(status)}), mode=$mode, paper=$paper"
          )

          if (!isPrintableStatus(status)) {
            return PrintResult(
              ok = false,
              statusCode = status,
              modeCode = mode,
              paperCode = paper,
              reason = "printer_state_${statusDescription(status)}"
            )
          }

          repeat(copies) { copyIndex ->
            service.printerInit(null)
            service.setAlignment(1, null)
            service.printText("${safeText(label)}\n", null)
            service.lineWrap(1, null)
            service.printBarCode(
              barcodeValue,
              BARCODE_TYPE_CODE128,
              BARCODE_HEIGHT_DOTS_58MM,
              BARCODE_WIDTH,
              BARCODE_TEXT_POSITION_NONE,
              null
            )
            if (humanText.isNotBlank()) {
              service.printText("${safeText(humanText)}\n", null)
            } else {
              service.printText("${safeText(barcodeValue)}\n", null)
            }
            service.lineWrap(2, null)
            Log.i(TAG, "printed barcode copy ${copyIndex + 1}/$copies")
          }

          runCatching { service.autoOutPaper(null) }
            .onFailure { Log.w(TAG, "autoOutPaper not available: ${it.message}") }

          return PrintResult(
            ok = true,
            statusCode = status,
            modeCode = mode,
            paperCode = paper,
            reason = null
          )
        } catch (error: Exception) {
          Log.e(TAG, "barcode attempt $attemptIndex failed", error)
          forceRebind()
        }
      }

      Log.e(TAG, "printQtyBarcodeLabel failed after $MAX_PRINT_ATTEMPTS attempts")
      PrintResult(ok = false, reason = "printer_unavailable")
    }
  }

  private fun safeText(rawValue: String?): String {
    val normalized = rawValue?.trim().orEmpty()
    if (normalized.isBlank()) return "-"
    return normalized.replace("\n", " ")
  }

  private fun awaitPrinterService(timeoutMs: Long): SunmiPrinterService? {
    printerService?.let { return it }

    if (!isBound) {
      bind()
    }

    val deadline = SystemClock.uptimeMillis() + timeoutMs
    while (SystemClock.uptimeMillis() < deadline) {
      printerService?.let { return it }
      Thread.sleep(80)
    }

    return printerService
  }

  private fun forceRebind() {
    try {
      if (isBound) {
        InnerPrinterManager.getInstance().unBindService(context, connectionCallback)
      }
    } catch (_: Exception) {
      // Best-effort cleanup before rebind.
    } finally {
      isBound = false
      printerService = null
    }

    bind()
    Thread.sleep(120)
  }

  private fun sanitizeLogoScale(rawValue: Double): Float {
    if (rawValue.isNaN() || rawValue.isInfinite()) {
      return DEFAULT_LOGO_SCALE
    }
    return rawValue.toFloat().coerceIn(MIN_LOGO_SCALE, MAX_LOGO_SCALE)
  }

  private fun loadPrintLogo(logoScale: Float): Bitmap? {
    return runCatching {
      val raw = BitmapFactory.decodeResource(context.resources, R.drawable.logokpf) ?: return null
      val cropped = cropByBackgroundColor(raw)
      val source = if (cropped != null && cropped != raw) {
        raw.recycle()
        cropped
      } else {
        raw
      }
      val targetWidth = (MAX_LOGO_WIDTH_PX * logoScale)
        .toInt()
        .coerceIn(MIN_LOGO_WIDTH_PX, MAX_LOGO_WIDTH_PX)
      val scaled = if (source.width <= targetWidth) {
        source
      } else {
        val scaledHeight = (source.height * (targetWidth.toFloat() / source.width)).toInt().coerceAtLeast(1)
        Bitmap.createScaledBitmap(source, targetWidth, scaledHeight, true).also {
          if (it != source) source.recycle()
        }
      }
      val printable = scaled

      // Thermal printers may render transparent pixels as black.
      // Flatten the logo onto a white background to avoid black square artifacts.
      val flattened = Bitmap.createBitmap(printable.width, printable.height, Bitmap.Config.RGB_565)
      val canvas = Canvas(flattened)
      canvas.drawColor(Color.WHITE)
      canvas.drawBitmap(
        printable,
        0f,
        0f,
        Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
      )
      printable.recycle()
      flattened
    }.getOrElse {
      Log.w(TAG, "Failed to decode/scale print logo", it)
      null
    }
  }

  private fun cropByBackgroundColor(bitmap: Bitmap): Bitmap? {
    if (bitmap.width < 8 || bitmap.height < 8) return bitmap
    val bgColor = bitmap.getPixel(0, 0)
    val alpha = Color.alpha(bgColor)
    val red = Color.red(bgColor)
    val green = Color.green(bgColor)
    val blue = Color.blue(bgColor)

    fun isBackground(pixel: Int): Boolean {
      return kotlin.math.abs(Color.alpha(pixel) - alpha) <= BG_TOLERANCE_ALPHA
        && kotlin.math.abs(Color.red(pixel) - red) <= BG_TOLERANCE_RGB
        && kotlin.math.abs(Color.green(pixel) - green) <= BG_TOLERANCE_RGB
        && kotlin.math.abs(Color.blue(pixel) - blue) <= BG_TOLERANCE_RGB
    }

    var top = 0
    while (top < bitmap.height) {
      var hasContent = false
      for (x in 0 until bitmap.width) {
        if (!isBackground(bitmap.getPixel(x, top))) {
          hasContent = true
          break
        }
      }
      if (hasContent) break
      top++
    }

    var bottom = bitmap.height - 1
    while (bottom >= top) {
      var hasContent = false
      for (x in 0 until bitmap.width) {
        if (!isBackground(bitmap.getPixel(x, bottom))) {
          hasContent = true
          break
        }
      }
      if (hasContent) break
      bottom--
    }

    var left = 0
    while (left < bitmap.width) {
      var hasContent = false
      for (y in top..bottom) {
        if (!isBackground(bitmap.getPixel(left, y))) {
          hasContent = true
          break
        }
      }
      if (hasContent) break
      left++
    }

    var right = bitmap.width - 1
    while (right >= left) {
      var hasContent = false
      for (y in top..bottom) {
        if (!isBackground(bitmap.getPixel(right, y))) {
          hasContent = true
          break
        }
      }
      if (hasContent) break
      right--
    }

    val croppedWidth = right - left + 1
    val croppedHeight = bottom - top + 1
    if (croppedWidth <= 0 || croppedHeight <= 0) {
      return bitmap
    }
    if (croppedWidth == bitmap.width && croppedHeight == bitmap.height) {
      return bitmap
    }
    return Bitmap.createBitmap(bitmap, left, top, croppedWidth, croppedHeight)
  }

  private fun isPrintableStatus(status: Int): Boolean {
    // Some SUNMI V3 firmware reports 0 even when printing is still possible.
    return status == STATUS_UNKNOWN_OR_UNINITIALIZED || status == STATUS_NORMAL || status == STATUS_PREPARING
  }

  private fun statusDescription(status: Int): String {
    return when (status) {
      STATUS_NORMAL -> "normal"
      STATUS_PREPARING -> "preparing"
      STATUS_UNKNOWN_OR_UNINITIALIZED -> "unknown_or_uninitialized"
      STATUS_COMMUNICATION -> "communication_error"
      STATUS_OUT_OF_PAPER -> "out_of_paper"
      STATUS_OVERHEATED -> "overheated"
      STATUS_COVER_OPEN -> "cover_open"
      STATUS_CUTTER_ERROR -> "cutter_error"
      STATUS_CUTTER_RECOVERED -> "cutter_recovered"
      STATUS_BLACK_MARK_NOT_DETECTED -> "black_mark_not_detected"
      STATUS_NO_PRINTER_DETECTED -> "no_printer_detected"
      STATUS_FIRMWARE_UPDATING -> "firmware_updating"
      else -> "unknown_$status"
    }
  }

  companion object {
    private const val TAG = "SunmiPrinterManager"
    private const val MAX_PRINT_ATTEMPTS = 3
    private const val PRINTER_WAIT_TIMEOUT_MS = 2400L
    private const val MAX_LOGO_WIDTH_PX = 384
    private const val MIN_LOGO_WIDTH_PX = 96
    private const val DEFAULT_LOGO_SCALE = 0.52f
    private const val MIN_LOGO_SCALE = 0.2f
    private const val MAX_LOGO_SCALE = 1.5f
    private const val BG_TOLERANCE_RGB = 10
    private const val BG_TOLERANCE_ALPHA = 10
    private const val LOGO_TEXT_GAP_LINES = 2

    // updatePrinterState() values from Sunmi docs.
    private const val STATUS_UNKNOWN_OR_UNINITIALIZED = 0
    private const val STATUS_NORMAL = 1
    private const val STATUS_PREPARING = 2
    private const val STATUS_COMMUNICATION = 3
    private const val STATUS_OUT_OF_PAPER = 4
    private const val STATUS_OVERHEATED = 5
    private const val STATUS_COVER_OPEN = 6
    private const val STATUS_CUTTER_ERROR = 7
    private const val STATUS_CUTTER_RECOVERED = 8
    private const val STATUS_BLACK_MARK_NOT_DETECTED = 9
    private const val STATUS_NO_PRINTER_DETECTED = 505
    private const val STATUS_FIRMWARE_UPDATING = 507

    private const val BARCODE_TYPE_CODE128 = 8
    private const val BARCODE_HEIGHT_DOTS_58MM = 96
    private const val BARCODE_WIDTH = 3
    private const val BARCODE_TEXT_POSITION_NONE = 0
  }
}
