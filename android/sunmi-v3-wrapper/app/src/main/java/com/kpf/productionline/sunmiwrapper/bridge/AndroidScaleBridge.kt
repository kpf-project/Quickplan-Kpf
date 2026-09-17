package com.kpf.productionline.sunmiwrapper.bridge

import android.webkit.JavascriptInterface
import com.kpf.productionline.sunmiwrapper.scale.ScaleSerialManager

class AndroidScaleBridge(
  private val scaleManager: ScaleSerialManager
) {
  @JavascriptInterface
  fun connect(configJson: String?): String {
    return scaleManager.connect(configJson)
  }

  @JavascriptInterface
  fun disconnect(): String {
    return scaleManager.disconnect()
  }

  @JavascriptInterface
  fun startPreview(configJson: String?): String {
    return scaleManager.startPreview(configJson)
  }

  @JavascriptInterface
  fun stopPreview(): String {
    return scaleManager.stopPreview()
  }

  @JavascriptInterface
  fun readStableWeight(configJson: String?): String {
    return scaleManager.readStableWeight(configJson)
  }

  @JavascriptInterface
  fun getState(): String {
    return scaleManager.getState()
  }
}
