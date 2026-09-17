package com.kpf.productionline.sunmiwrapper.scale

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver
import com.hoho.android.usbserial.driver.Ch34xSerialDriver
import com.hoho.android.usbserial.driver.Cp21xxSerialDriver
import com.hoho.android.usbserial.driver.FtdiSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.ProlificSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

data class ScaleSerialConfig(
  val baudRate: Int = 9600,
  val dataBits: Int = UsbSerialPort.DATABITS_8,
  val stopBits: Int = UsbSerialPort.STOPBITS_1,
  val parity: Int = UsbSerialPort.PARITY_NONE,
  val readTimeoutMs: Int = 900,
  val stableReadTimeoutMs: Int = 2500,
  val previewIntervalMs: Int = 450,
  val previewCommand: String = "SI\r\n",
  val stableCommand: String = "S\r\n",
  val handshake: String = "none",
  val previewCommands: List<String> = listOf("SI\r\n", "IP\r\n", "P\r\n"),
  val stableCommands: List<String> = listOf("S\r\n", "SP\r\n", "P\r\n"),
  val assertDtr: Boolean = true,
  val assertRts: Boolean = true,
) {
  companion object {
    fun fromJson(raw: String?): ScaleSerialConfig {
      if (raw.isNullOrBlank()) {
        return ScaleSerialConfig()
      }

      return try {
        val json = JSONObject(raw)
        ScaleSerialConfig(
          baudRate = json.optInt("baudRate", 9600).coerceIn(300, 57600),
          dataBits = when (json.optInt("dataBits", 8)) {
            7 -> UsbSerialPort.DATABITS_7
            else -> UsbSerialPort.DATABITS_8
          },
          stopBits = when (json.optInt("stopBits", 1)) {
            2 -> UsbSerialPort.STOPBITS_2
            else -> UsbSerialPort.STOPBITS_1
          },
          parity = when (json.optString("parity", "N").trim().uppercase(Locale.US)) {
            "E", "EVEN" -> UsbSerialPort.PARITY_EVEN
            "O", "ODD" -> UsbSerialPort.PARITY_ODD
            else -> UsbSerialPort.PARITY_NONE
          },
          readTimeoutMs = json.optInt("readTimeoutMs", 900).coerceIn(200, 5000),
          stableReadTimeoutMs = json.optInt("stableReadTimeoutMs", 2500).coerceIn(400, 8000),
          previewIntervalMs = json.optInt("previewIntervalMs", 450).coerceIn(200, 3000),
          previewCommand = normalizeCommand(json.optString("previewCommand", "SI")),
          stableCommand = normalizeCommand(json.optString("stableCommand", "S")),
          handshake = json.optString("handshake", "none").trim().lowercase(Locale.US),
          previewCommands = normalizeCommandList(
            json.optJSONArray("previewCommands"),
            json.optString("previewCommand", "SI"),
            listOf("SI", "IP", "P")
          ),
          stableCommands = normalizeCommandList(
            json.optJSONArray("stableCommands"),
            json.optString("stableCommand", "S"),
            listOf("S", "SP", "P")
          ),
          assertDtr = json.optBoolean("assertDtr", true),
          assertRts = json.optBoolean("assertRts", true),
        )
      } catch (_: Exception) {
        ScaleSerialConfig()
      }
    }

    private fun normalizeCommand(raw: String?): String {
      val trimmed = raw?.trim().orEmpty()
      if (trimmed.isBlank()) {
        return "\r\n"
      }
      return if (trimmed.endsWith("\r\n")) trimmed else "$trimmed\r\n"
    }

    private fun normalizeCommandList(
      rawArray: JSONArray?,
      singleValue: String?,
      defaults: List<String>,
    ): List<String> {
      val values = mutableListOf<String>()

      if (rawArray != null) {
        for (index in 0 until rawArray.length()) {
          val normalized = normalizeCommand(rawArray.optString(index, ""))
          if (normalized.isNotBlank()) {
            values += normalized
          }
        }
      }

      val normalizedSingle = normalizeCommand(singleValue)
      if (normalizedSingle.isNotBlank()) {
        values += normalizedSingle
      }

      defaults.forEach { candidate ->
        values += normalizeCommand(candidate)
      }

      return values
        .map { it.trimEnd('\r', '\n') }
        .filter { it.isNotBlank() }
        .distinct()
        .map { "$it\r\n" }
    }
  }
}

class ScaleSerialManager(
  private val context: Context,
  private val onStatusChanged: (JSONObject) -> Unit,
  private val onWeightUpdated: (JSONObject) -> Unit,
) {
  private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
  private val mainHandler = Handler(Looper.getMainLooper())
  private val ioLock = Any()
  private val previewEnabled = AtomicBoolean(false)

  @Volatile
  private var currentConfig = ScaleSerialConfig()

  @Volatile
  private var activeDriver: UsbSerialDriver? = null

  @Volatile
  private var activePort: UsbSerialPort? = null

  @Volatile
  private var activeConnection: UsbDeviceConnection? = null

  @Volatile
  private var latestWeight: ParsedScaleWeight? = null

  @Volatile
  private var lastRawResponse: String? = null

  @Volatile
  private var lastCommandUsed: String? = null

  @Volatile
  private var pendingPermissionDevice: UsbDevice? = null

  @Volatile
  private var lastStatusJson = JSONObject()

  private val serialExecutor = Executors.newSingleThreadExecutor()
  private var previewExecutor: ScheduledExecutorService? = null

  private val usbPermissionReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (ACTION_USB_PERMISSION != intent?.action) {
        return
      }

      val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
      }
      val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
      if (device == null && granted && pendingPermissionDevice != null) {
        val fallbackDevice = pendingPermissionDevice!!
        emitStatus(
          "permission_callback_missing_device",
          "USB permission granted but callback device is null; retrying pending device",
          connected = false,
          extra = JSONObject()
            .put("permissionGranted", true)
            .put("permissionCallbackDeviceNull", true)
            .put("pendingDeviceName", fallbackDevice.deviceName)
            .put("pendingVendorId", fallbackDevice.vendorId)
            .put("pendingProductId", fallbackDevice.productId)
        )
        serialExecutor.execute {
          openConnection(fallbackDevice, currentConfig)
          if (previewEnabled.get()) {
            ensurePreviewScheduled()
          }
        }
        return
      }
      if (device != null && !granted) {
        emitStatus(
          "permission_denied",
          "USB permission denied",
          connected = false,
          extra = JSONObject()
            .put("permissionGranted", false)
            .put("permissionDeviceName", device.deviceName)
            .put("permissionVendorId", device.vendorId)
            .put("permissionProductId", device.productId)
        )
        return
      }
      if (device != null && granted) {
        emitStatus(
          "permission_granted",
          "USB permission granted; opening device",
          connected = false,
          extra = JSONObject()
            .put("permissionGranted", true)
            .put("permissionDeviceName", device.deviceName)
            .put("permissionVendorId", device.vendorId)
            .put("permissionProductId", device.productId)
        )
      }
      if (device == null) {
        emitStatus("error", "ไม่พบอุปกรณ์หลังขอสิทธิ์ USB", connected = false)
        return
      }

      if (!granted) {
        emitStatus("permission_denied", "ไม่ได้รับสิทธิ์เชื่อมต่ออุปกรณ์ USB", connected = false)
        return
      }

      serialExecutor.execute {
        openConnection(device, currentConfig)
        if (previewEnabled.get()) {
          ensurePreviewScheduled()
        }
      }
    }
  }

  init {
    val filter = IntentFilter(ACTION_USB_PERMISSION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(usbPermissionReceiver, filter)
    }
    emitStatus("idle", "พร้อมเชื่อมต่อเครื่องชั่ง", connected = false)
  }

  fun connect(rawConfig: String?): String {
    currentConfig = ScaleSerialConfig.fromJson(rawConfig)
    val result = ensureConnected(currentConfig)
    return result.toString()
  }

  fun disconnect(): String {
    previewEnabled.set(false)
    stopPreviewInternal()
    closeConnection()
    emitStatus("disconnected", "ยกเลิกการเชื่อมต่อเครื่องชั่งแล้ว", connected = false)
    return JSONObject()
      .put("ok", true)
      .put("state", "disconnected")
      .toString()
  }

  fun startPreview(rawConfig: String?): String {
    currentConfig = ScaleSerialConfig.fromJson(rawConfig)
    previewEnabled.set(true)
    val result = ensureConnected(currentConfig)
    val ok = result.optBoolean("ok", false)
    if (ok) {
      ensurePreviewScheduled()
    }
    return result
      .put("previewEnabled", previewEnabled.get())
      .toString()
  }

  fun stopPreview(): String {
    previewEnabled.set(false)
    stopPreviewInternal()
    return JSONObject()
      .put("ok", true)
      .put("previewEnabled", false)
      .toString()
  }

  fun readStableWeight(rawConfig: String?): String {
    currentConfig = ScaleSerialConfig.fromJson(rawConfig)
    val connectionResult = ensureConnected(currentConfig)
    if (!connectionResult.optBoolean("ok", false)) {
      return connectionResult.toString()
    }

    val parsed = performCommandRead(currentConfig.stableCommands, currentConfig.stableReadTimeoutMs, true)
      ?: return errorResult("stable_read_failed").toString()

    latestWeight = parsed
    emitWeight(parsed, "stable-read")
    return JSONObject()
      .put("ok", true)
      .put("state", "stable")
      .put("weightKg", parsed.weightKg)
      .put("displayWeight", parsed.displayWeight)
      .put("displayText", parsed.displayText)
      .put("unit", parsed.unit)
      .put("stable", parsed.stable)
      .put("rawText", parsed.rawText)
      .toString()
  }

  fun getState(): String {
    return JSONObject(lastStatusJson.toString())
      .put("latestWeightKg", latestWeight?.weightKg)
      .put("latestDisplayText", latestWeight?.displayText)
      .put("lastRawText", lastRawResponse)
      .put("lastCommandUsed", lastCommandUsed)
      .put("attachedUsbDevices", buildAttachedDeviceList())
      .toString()
  }

  fun destroy() {
    previewEnabled.set(false)
    stopPreviewInternal()
    closeConnection()
    try {
      context.unregisterReceiver(usbPermissionReceiver)
    } catch (_: Exception) {
      // Receiver may already be unregistered on some ROMs.
    }
    serialExecutor.shutdownNow()
  }

  private fun ensureConnected(config: ScaleSerialConfig): JSONObject {
    synchronized(ioLock) {
      if (activePort != null && activeConnection != null) {
        return JSONObject()
          .put("ok", true)
          .put("state", "connected")
      }
    }

    val drivers = findCandidateDrivers()
    if (drivers.isEmpty()) {
      emitStatus(
        "device_not_found",
        "USB serial device not detected",
        connected = false,
        extra = buildConfigExtra(config).put("attachedUsbDevices", buildAttachedDeviceList())
      )
      emitStatus("device_not_found", "ไม่พบสาย USB-to-RS232 ที่รองรับ", connected = false)
      return errorResult("ไม่พบอุปกรณ์ USB serial")
        .put("state", "device_not_found")
        .put("attachedUsbDevices", buildAttachedDeviceList())
    }

    val driver = drivers.first()
    val device = driver.device

    if (!usbManager.hasPermission(device)) {
      requestPermission(device)
      emitStatus("permission_pending", "กรุณาอนุญาตสิทธิ์ USB เพื่อเชื่อมต่อเครื่องชั่ง", connected = false)
      return JSONObject()
        .put("ok", false)
        .put("pending", true)
        .put("state", "permission_pending")
        .put("message", "permission_pending")
        .put("attachedUsbDevices", buildAttachedDeviceList())
    }

    val opened = openConnection(device, config)
    return if (opened) {
      JSONObject()
        .put("ok", true)
        .put("state", "connected")
    } else {
      errorResult("เชื่อมต่อเครื่องชั่งไม่สำเร็จ")
        .put("state", "connect_failed")
    }
  }

  private fun requestPermission(device: UsbDevice) {
    pendingPermissionDevice = device
    val permissionIntent = PendingIntent.getBroadcast(
      context,
      0,
      Intent(ACTION_USB_PERMISSION).setPackage(context.packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    mainHandler.post {
      usbManager.requestPermission(device, permissionIntent)
    }
  }

  private fun openConnection(device: UsbDevice, config: ScaleSerialConfig): Boolean {
    val driver = probeSingleDevice(device)
    if (driver == null) {
      emitStatus("unsupported_device", "อุปกรณ์ USB นี้ยังไม่รองรับไดรเวอร์ serial", connected = false)
      return false
    }

    val port = driver.ports.firstOrNull()
    if (port == null) {
      emitStatus("port_not_found", "ไม่พบ serial port บนอุปกรณ์ที่เชื่อมต่อ", connected = false)
      return false
    }

    return try {
      closeConnection()
      val connection = usbManager.openDevice(device)
      if (connection == null) {
        emitStatus("permission_pending", "ยังไม่สามารถเปิดอุปกรณ์ USB ได้", connected = false)
        return false
      }

      port.open(connection)
      port.setParameters(config.baudRate, config.dataBits, config.stopBits, config.parity)
      applySerialTuning(port, config)
      activeDriver = driver
      activePort = port
      activeConnection = connection
      pendingPermissionDevice = null
      emitStatus(
        "connected",
        "เชื่อมต่อเครื่องชั่งแล้ว",
        connected = true,
        extra = buildConfigExtra(config)
          .put("deviceName", device.deviceName)
          .put("vendorId", device.vendorId)
          .put("productId", device.productId)
      )
      true
    } catch (error: Exception) {
      Log.e(TAG, "Failed to open scale connection", error)
      closeConnection()
      emitStatus("connect_failed", "เชื่อมต่อเครื่องชั่งไม่สำเร็จ", connected = false)
      false
    }
  }

  private fun closeConnection() {
    synchronized(ioLock) {
      try {
        activePort?.close()
      } catch (_: Exception) {
        // Ignore close failure.
      }
      try {
        activeConnection?.close()
      } catch (_: Exception) {
        // Ignore close failure.
      }
      activePort = null
      activeDriver = null
      activeConnection = null
    }
  }

  private fun ensurePreviewScheduled() {
    if (!previewEnabled.get()) {
      return
    }
    if (previewExecutor != null && previewExecutor?.isShutdown == false) {
      return
    }

    previewExecutor = Executors.newSingleThreadScheduledExecutor().apply {
      scheduleWithFixedDelay(
        {
          if (!previewEnabled.get()) {
            return@scheduleWithFixedDelay
          }

          val parsed = performCommandRead(currentConfig.previewCommands, currentConfig.readTimeoutMs, false)
          if (parsed != null) {
            latestWeight = parsed
            emitWeight(parsed, "preview")
          }
        },
        0,
        currentConfig.previewIntervalMs.toLong(),
        TimeUnit.MILLISECONDS
      )
    }
  }

  private fun stopPreviewInternal() {
    previewExecutor?.shutdownNow()
    previewExecutor = null
  }

  private fun performCommandRead(commands: List<String>, timeoutMs: Int, requireStable: Boolean): ParsedScaleWeight? {
    val port = activePort ?: return null
    return synchronized(ioLock) {
      try {
        val commandCandidates = commands.ifEmpty {
          if (requireStable) currentConfig.stableCommands else currentConfig.previewCommands
        }
        var lastResponse = ""
        var lastCommand = ""

        for (command in commandCandidates) {
          val normalizedCommand = command.takeIf { it.isNotBlank() } ?: continue
          flushPort(port)
          port.write(normalizedCommand.toByteArray(StandardCharsets.US_ASCII), timeoutMs)
          val rawResponse = readResponse(port, timeoutMs)
          lastResponse = rawResponse
          lastCommand = normalizedCommand.trim()
          lastRawResponse = rawResponse
          lastCommandUsed = lastCommand
          val parsed = parseScaleResponse(rawResponse, requireStable, lastCommand)
          if (parsed != null) {
            emitStatus(
              if (parsed.stable) "stable" else "reading",
              if (parsed.stable) "Scale reading is stable" else "Reading live scale value",
              connected = true,
              extra = buildConfigExtra(currentConfig)
                .put("lastRawText", rawResponse)
                .put("lastCommandUsed", lastCommand)
            )
            return@synchronized parsed
          }
        }

        emitStatus(
          "read_failed",
          "Scale response could not be parsed",
          connected = true,
          extra = buildConfigExtra(currentConfig)
            .put("lastRawText", lastResponse)
            .put("lastCommandUsed", lastCommand)
        )
        null
      } catch (error: Exception) {
        Log.e(TAG, "Scale read failed", error)
        emitStatus(
          "read_failed",
          "Scale did not respond",
          connected = activePort != null,
          extra = buildConfigExtra(currentConfig)
            .put("lastRawText", lastRawResponse)
            .put("lastCommandUsed", lastCommandUsed)
            .put("error", error.message ?: "unknown_error")
        )
        null
      }
    }
  }

  private fun performCommandRead(command: String, timeoutMs: Int, requireStable: Boolean): ParsedScaleWeight? {
    val port = activePort ?: return null
    return synchronized(ioLock) {
      try {
        flushPort(port)
        port.write(command.toByteArray(StandardCharsets.US_ASCII), timeoutMs)
        val rawResponse = readResponse(port, timeoutMs)
        val parsed = parseScaleResponse(rawResponse, requireStable)
        if (parsed == null) {
          emitStatus("read_failed", "อ่านข้อมูลจากเครื่องชั่งไม่สำเร็จ", connected = true)
          return@synchronized null
        }

        emitStatus(
          if (parsed.stable) "stable" else "reading",
          if (parsed.stable) "ค่าน้ำหนักนิ่งแล้ว" else "กำลังอ่านค่าน้ำหนัก",
          connected = true
        )
        parsed
      } catch (error: Exception) {
        Log.e(TAG, "Scale read failed", error)
        emitStatus("read_failed", "เครื่องชั่งไม่ตอบสนอง", connected = activePort != null)
        null
      }
    }
  }

  private fun flushPort(port: UsbSerialPort) {
    val buffer = ByteArray(128)
    repeat(2) {
      try {
        val read = port.read(buffer, 30)
        if (read <= 0) {
          return
        }
      } catch (_: Exception) {
        return
      }
    }
  }

  private fun readResponse(port: UsbSerialPort, timeoutMs: Int): String {
    val buffer = ByteArray(256)
    val deadline = System.currentTimeMillis() + timeoutMs
    val builder = StringBuilder()

    while (System.currentTimeMillis() < deadline) {
      val remaining = (deadline - System.currentTimeMillis()).coerceAtLeast(40)
      val bytesRead = try {
        port.read(buffer, remaining.toInt())
      } catch (error: IOException) {
        if (builder.isNotBlank()) {
          break
        }
        throw error
      }

      if (bytesRead > 0) {
        builder.append(String(buffer, 0, bytesRead, StandardCharsets.US_ASCII))
        if (builder.contains("\n") || builder.contains("\r")) {
          break
        }
      }
    }

    return builder.toString()
  }

  private fun parseScaleResponse(
    rawResponse: String,
    requireStable: Boolean,
    commandUsed: String,
  ): ParsedScaleWeight? {
    return parseScaleResponse(rawResponse, requireStable)?.copy(commandUsed = commandUsed)
  }

  private fun parseScaleResponse(rawResponse: String, requireStable: Boolean): ParsedScaleWeight? {
    val normalizedLine = rawResponse
      .split('\r', '\n')
      .map { it.trim() }
      .lastOrNull { it.isNotBlank() }
      ?: return null

    val uppercase = normalizedLine.uppercase(Locale.US)
    if (
      uppercase.contains("OL")
      || uppercase.contains("OVER")
      || uppercase.contains("UNDER")
      || uppercase.contains("ERR")
    ) {
      return null
    }

    val numberMatch = NUMBER_PATTERN.findAll(normalizedLine).lastOrNull() ?: return null
    val displayWeight = numberMatch.value.toDoubleOrNull() ?: return null
    val unitMatch = UNIT_PATTERN.find(normalizedLine)
    val unit = unitMatch?.groupValues?.get(1)?.lowercase(Locale.US) ?: "kg"
    val stable = when {
      STABLE_PATTERN.containsMatchIn(uppercase) -> true
      UNSTABLE_PATTERN.containsMatchIn(uppercase) -> false
      requireStable -> true
      else -> latestWeight?.stable == true && abs((latestWeight?.displayWeight ?: displayWeight) - displayWeight) < 0.0001
    }

    val weightKg = when (unit) {
      "g" -> displayWeight / 1000.0
      "lb" -> displayWeight * 0.45359237
      else -> displayWeight
    }

    return ParsedScaleWeight(
      weightKg = round(weightKg),
      displayWeight = round(displayWeight),
      displayText = String.format(Locale.US, "%.3f %s", displayWeight, unit),
      unit = unit,
      stable = stable,
      rawText = normalizedLine,
    )
  }

  private fun findCandidateDrivers(): List<UsbSerialDriver> {
    val foundDrivers = linkedMapOf<String, UsbSerialDriver>()
    UsbSerialProber.getDefaultProber().findAllDrivers(usbManager).forEach { driver ->
      foundDrivers[driver.device.deviceName] = driver
    }
    buildCustomProber().findAllDrivers(usbManager).forEach { driver ->
      foundDrivers.putIfAbsent(driver.device.deviceName, driver)
    }
    return foundDrivers.values.toList()
  }

  private fun probeSingleDevice(device: UsbDevice): UsbSerialDriver? {
    return UsbSerialProber.getDefaultProber().probeDevice(device)
      ?: buildCustomProber().probeDevice(device)
  }

  private fun buildCustomProber(): UsbSerialProber {
    val table = ProbeTable().apply {
      addProduct(0x067B, 0x2303, ProlificSerialDriver::class.java)
      addProduct(0x0403, 0x6001, FtdiSerialDriver::class.java)
      addProduct(0x10C4, 0xEA60, Cp21xxSerialDriver::class.java)
      addProduct(0x1A86, 0x7523, Ch34xSerialDriver::class.java)
      addProduct(0x1A86, 0x5523, Ch34xSerialDriver::class.java)
      addProduct(0x0557, 0x2008, CdcAcmSerialDriver::class.java)
    }
    return UsbSerialProber(table)
  }

  private fun applySerialTuning(port: UsbSerialPort, config: ScaleSerialConfig) {
    try {
      val supportedFlowControl = port.getSupportedFlowControl()
      val desiredFlowControl = when (config.handshake) {
        "rts_cts", "rts-cts" -> UsbSerialPort.FlowControl.RTS_CTS
        "dtr_dsr", "dtr-dsr" -> UsbSerialPort.FlowControl.DTR_DSR
        "xon_xoff", "xon-xoff" -> UsbSerialPort.FlowControl.XON_XOFF
        else -> UsbSerialPort.FlowControl.NONE
      }
      if (supportedFlowControl.contains(desiredFlowControl)) {
        port.setFlowControl(desiredFlowControl)
      } else if (supportedFlowControl.contains(UsbSerialPort.FlowControl.NONE)) {
        port.setFlowControl(UsbSerialPort.FlowControl.NONE)
      }
    } catch (_: Exception) {
      // Some chipsets do not expose flow-control APIs.
    }

    try {
      port.setDTR(config.assertDtr)
    } catch (_: Exception) {
      // Ignore unsupported control line.
    }

    try {
      port.setRTS(config.assertRts)
    } catch (_: Exception) {
      // Ignore unsupported control line.
    }
  }

  private fun buildConfigExtra(config: ScaleSerialConfig): JSONObject {
    return JSONObject().apply {
      put("baudRate", config.baudRate)
      put("dataBits", config.dataBits)
      put("stopBits", config.stopBits)
      put("parity", config.parity)
      put("handshake", config.handshake)
      put("flowControl", config.handshake)
      put("previewCommands", JSONArray(config.previewCommands.map { it.trim() }))
      put("stableCommands", JSONArray(config.stableCommands.map { it.trim() }))
      put("assertDtr", config.assertDtr)
      put("assertRts", config.assertRts)
      put("dtr", config.assertDtr)
      put("rts", config.assertRts)
    }
  }

  private fun buildAttachedDeviceList(): JSONArray {
    val devices = usbManager.deviceList.values.toList()
    return JSONArray().apply {
      devices.forEach { device ->
        put(
          JSONObject()
            .put("deviceName", device.deviceName)
            .put("vendorId", device.vendorId)
            .put("productId", device.productId)
            .put("productName", device.productName ?: "")
            .put("manufacturerName", device.manufacturerName ?: "")
        )
      }
    }
  }

  private fun emitStatus(
    state: String,
    message: String,
    connected: Boolean,
    extra: JSONObject? = null,
  ) {
    val payload = JSONObject().apply {
      put("connected", connected)
      put("state", state)
      put("message", message)
      put("previewEnabled", previewEnabled.get())
      put("latestWeightKg", latestWeight?.weightKg)
      put("latestDisplayText", latestWeight?.displayText)
      put("lastRawText", lastRawResponse)
      put("lastCommandUsed", lastCommandUsed)
      put("attachedUsbDevices", buildAttachedDeviceList())
      if (extra != null) {
        val keys = extra.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          put(key, extra.opt(key))
        }
      }
    }
    lastStatusJson = payload
    mainHandler.post {
      onStatusChanged(payload)
    }
  }

  private fun emitWeight(parsed: ParsedScaleWeight, source: String) {
    val payload = JSONObject().apply {
      put("weightKg", parsed.weightKg)
      put("displayWeight", parsed.displayWeight)
      put("displayText", parsed.displayText)
      put("unit", parsed.unit)
      put("stable", parsed.stable)
      put("rawText", parsed.rawText)
      put("commandUsed", parsed.commandUsed)
      put("source", source)
    }
    mainHandler.post {
      onWeightUpdated(payload)
    }
  }

  private fun errorResult(message: String): JSONObject {
    return JSONObject()
      .put("ok", false)
      .put("message", message)
  }

  private fun round(value: Double): Double {
    return String.format(Locale.US, "%.4f", value).toDouble()
  }

  data class ParsedScaleWeight(
    val weightKg: Double,
    val displayWeight: Double,
    val displayText: String,
    val unit: String,
    val stable: Boolean,
    val rawText: String,
    val commandUsed: String? = null,
  )

  companion object {
    private const val TAG = "ScaleSerialManager"
    private const val ACTION_USB_PERMISSION = "com.kpf.productionline.sunmiwrapper.USB_PERMISSION"
    private val NUMBER_PATTERN = Regex("[-+]?\\d+(?:\\.\\d+)?")
    private val UNIT_PATTERN = Regex("\\b(kg|g|lb)\\b", RegexOption.IGNORE_CASE)
    private val STABLE_PATTERN = Regex("(^S\\s+S\\b|\\bST,|\\bSTABLE\\b)")
    private val UNSTABLE_PATTERN = Regex("(^S\\s+D\\b|\\bUS,|\\bUNSTABLE\\b)")
  }
}

