package com.kpf.productionline.sunmiwrapper.bridge

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import android.webkit.JavascriptInterface
import com.kpf.productionline.sunmiwrapper.R
import com.kpf.productionline.sunmiwrapper.print.SunmiPrinterManager
import org.json.JSONObject

class AndroidPrinterBridge(
  private val context: Context,
  private val printerManager: SunmiPrinterManager
) {
  private val prefs by lazy {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  @JavascriptInterface
  fun printReceipt(payloadJson: String): String {
    return printDailyWorkSlip(payloadJson)
  }

  @JavascriptInterface
  fun getMachineCode(): String {
    return resolveMachineCode()
  }

  @JavascriptInterface
  fun setMachineCode(rawMachineCode: String?): String {
    val normalized = normalizeMachineCode(rawMachineCode)
      ?: return "error:invalid_machine_code"
    prefs.edit().putString(PREF_MACHINE_CODE, normalized).apply()
    return normalized
  }

  @JavascriptInterface
  fun hasNetworkConnection(): Boolean {
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      ?: return false
    val activeNetwork = connectivityManager.activeNetwork ?: return false
    val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  @JavascriptInterface
  fun printDailyWorkSlip(payloadJson: String): String {
    return printDailyWorkSlipInternal(payloadJson)
  }

  @JavascriptInterface
  fun printSlip(payloadJson: String): String {
    return printDailyWorkSlipInternal(payloadJson)
  }

  @JavascriptInterface
  fun printBarcodeLabel(payloadJson: String): String {
    return printBarcodeLabelInternal(payloadJson)
  }

  @JavascriptInterface
  fun printBarcode(payloadJson: String): String {
    return printBarcodeLabelInternal(payloadJson)
  }

  private fun printDailyWorkSlipInternal(payloadJson: String): String {
    return try {
      val payload = JSONObject(payloadJson)
      val type = payload.optString("type")
      if (type == "piece_rate_slip") {
        val data = payload.optJSONObject("data") ?: return "error:missing_data"
        val normalizedData = JSONObject(data.toString()).apply {
          if (!has("docNo")) {
            put("docNo", payload.optString("docNo", data.optString("docNo", "")))
          }
          if (!has("machineCode")) {
            val machineCodeFromPayload = payload.optString(
              "machineCode",
              data.optString("machineCode", "")
            )
            put("machineCode", normalizeMachineCode(machineCodeFromPayload) ?: resolveMachineCode())
          }
          if (!has("operatorUsername")) {
            put(
              "operatorUsername",
              payload.optString(
                "operatorUsername",
                payload.optString(
                  "recordedBy",
                  data.optString("operatorUsername", "")
                )
              )
            )
          }
          if (!has("logoScale")) {
            val payloadLogoScale = payload.optDouble("logoScale", Double.NaN)
            val dataLogoScale = data.optDouble("logoScale", Double.NaN)
            val resolvedLogoScale = when {
              !payloadLogoScale.isNaN() && !payloadLogoScale.isInfinite() -> payloadLogoScale
              !dataLogoScale.isNaN() && !dataLogoScale.isInfinite() -> dataLogoScale
              else -> DEFAULT_LOGO_SCALE
            }
            put("logoScale", resolvedLogoScale)
          }
        }

        val result = printerManager.printPieceRateSlip(normalizedData)
        return if (result.ok) {
          Log.i(
            TAG,
            "printPieceRateSlip: ok (status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
          )
          "ok"
        } else {
          val reason = result.reason ?: "printer_unavailable"
          Log.w(
            TAG,
            "printPieceRateSlip: failed ($reason, status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
          )
          "error:$reason"
        }
      }

      if (type != "daily_work_slip") {
        Log.w(TAG, "Rejected payload type: $type")
        return "error:unsupported_type"
      }

      val data = payload.optJSONObject("data") ?: return "error:missing_data"
      val normalizedData = JSONObject(data.toString()).apply {
        if (!has("docNo")) {
          put("docNo", payload.optString("docNo", data.optString("docNo", "")))
        }
        if (!has("machineCode")) {
          val machineCodeFromPayload = payload.optString(
            "machineCode",
            data.optString("machineCode", "")
          )
          put("machineCode", normalizeMachineCode(machineCodeFromPayload) ?: resolveMachineCode())
        }
        if (!has("sizeValue")) {
          put("sizeValue", payload.optString("sizeValue", data.optString("size", "")))
        }
        if (!has("fillingValue")) {
          put("fillingValue", payload.optString("fillingValue", data.optString("filling", "")))
        }
        if (!has("operatorUsername")) {
          put(
            "operatorUsername",
            payload.optString(
              "operatorUsername",
              payload.optString(
                "recordedBy",
                data.optString("operatorUsername", "")
              )
            )
          )
        }
        if (!has("logoScale")) {
          val payloadLogoScale = payload.optDouble("logoScale", Double.NaN)
          val dataLogoScale = data.optDouble("logoScale", Double.NaN)
          val resolvedLogoScale = when {
            !payloadLogoScale.isNaN() && !payloadLogoScale.isInfinite() -> payloadLogoScale
            !dataLogoScale.isNaN() && !dataLogoScale.isInfinite() -> dataLogoScale
            else -> DEFAULT_LOGO_SCALE
          }
          put("logoScale", resolvedLogoScale)
        }
      }

      Log.i(
        TAG,
        "print payload fields: docNo=${normalizedData.optString("docNo", "-")}, machine=${normalizedData.optString("machineCode", "-")}, size=${normalizedData.optString("sizeValue", "-")}, filling=${normalizedData.optString("fillingValue", "-")}, operator=${normalizedData.optString("operatorUsername", "-")}"
      )

      val result = printerManager.printDailyWorkSlip(normalizedData)
      if (result.ok) {
        Log.i(
          TAG,
          "printDailyWorkSlip: ok (status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
        )
        "ok"
      } else {
        val reason = result.reason ?: "printer_unavailable"
        Log.w(
          TAG,
          "printDailyWorkSlip: failed ($reason, status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
        )
        "error:$reason"
      }
    } catch (error: Exception) {
      Log.e(TAG, "printDailyWorkSlipInternal failed", error)
      "error:${error.message ?: "unknown_error"}"
    }
  }

  private fun printBarcodeLabelInternal(payloadJson: String): String {
    return try {
      val payload = JSONObject(payloadJson)
      val type = payload.optString("type")
      if (type.isNotBlank() && type != "qty_barcode_label") {
        Log.w(TAG, "Rejected barcode payload type: $type")
        return "error:unsupported_type"
      }

      val data = payload.optJSONObject("data") ?: payload
      val normalizedData = JSONObject(data.toString()).apply {
        if (!has("barcodeType")) {
          put("barcodeType", payload.optString("barcodeType", data.optString("barcodeType", "CODE128")))
        }
        if (!has("paperWidthMm")) {
          put("paperWidthMm", payload.optInt("paperWidthMm", data.optInt("paperWidthMm", 58)))
        }
        if (!has("barcodeValue")) {
          put("barcodeValue", payload.optString("barcodeValue", data.optString("barcodeValue", "")))
        }
        if (!has("displayQty")) {
          put("displayQty", payload.optInt("displayQty", data.optInt("displayQty", 0)))
        }
        if (!has("label")) {
          put("label", payload.optString("label", data.optString("label", "")))
        }
        if (!has("humanText")) {
          put("humanText", payload.optString("humanText", data.optString("humanText", "")))
        }
      }

      val barcodeValue = normalizedData.optString("barcodeValue", "").trim()
      if (barcodeValue.isEmpty()) {
        return "error:missing_barcode_value"
      }

      val result = printerManager.printQtyBarcodeLabel(normalizedData)
      if (result.ok) {
        Log.i(
          TAG,
          "printBarcodeLabel: ok (status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
        )
        "ok"
      } else {
        val reason = result.reason ?: "printer_unavailable"
        Log.w(
          TAG,
          "printBarcodeLabel: failed ($reason, status=${result.statusCode}, mode=${result.modeCode}, paper=${result.paperCode})"
        )
        "error:$reason"
      }
    } catch (error: Exception) {
      Log.e(TAG, "printBarcodeLabelInternal failed", error)
      "error:${error.message ?: "unknown_error"}"
    }
  }

  private fun resolveMachineCode(): String {
    val stored = normalizeMachineCode(prefs.getString(PREF_MACHINE_CODE, null))
    if (stored != null) {
      return stored
    }
    val fromResource = normalizeMachineCode(context.getString(R.string.default_machine_code))
    if (fromResource != null) {
      return fromResource
    }
    return DEFAULT_MACHINE_CODE
  }

  private fun normalizeMachineCode(rawMachineCode: String?): String? {
    val normalized = rawMachineCode
      ?.trim()
      ?.uppercase()
      ?.replace(Regex("[^A-Z0-9]"), "")
      ?: return null
    if (normalized.length !in 2..8) {
      return null
    }
    return normalized
  }

  companion object {
    private const val TAG = "AndroidPrinterBridge"
    private const val PREFS_NAME = "wrapper_config"
    private const val PREF_MACHINE_CODE = "machine_code"
    private const val DEFAULT_MACHINE_CODE = "P00"
    private const val DEFAULT_LOGO_SCALE = 0.52
  }
}
