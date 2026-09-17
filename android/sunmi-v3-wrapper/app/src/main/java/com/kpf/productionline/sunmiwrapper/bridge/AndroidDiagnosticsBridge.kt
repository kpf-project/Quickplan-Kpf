package com.kpf.productionline.sunmiwrapper.bridge

import android.util.Log
import android.webkit.JavascriptInterface

class AndroidDiagnosticsBridge {
  @JavascriptInterface
  fun report(payload: String?) {
    val normalized = payload?.take(MAX_LOG_LENGTH).orEmpty()
    Log.e(TAG, normalized.ifBlank { "Empty web runtime diagnostic" })
  }

  private companion object {
    private const val TAG = "KPFWebRuntime"
    private const val MAX_LOG_LENGTH = 8_000
  }
}
