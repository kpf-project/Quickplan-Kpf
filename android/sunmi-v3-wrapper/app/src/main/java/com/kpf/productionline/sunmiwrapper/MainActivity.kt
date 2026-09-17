package com.kpf.productionline.sunmiwrapper

import android.app.Activity
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.webkit.CookieManager
import android.webkit.ConsoleMessage
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ServiceWorkerController
import android.webkit.WebResourceError
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.ValueCallback
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.kpf.productionline.sunmiwrapper.bridge.AndroidDiagnosticsBridge
import com.kpf.productionline.sunmiwrapper.bridge.AndroidPrinterBridge
import com.kpf.productionline.sunmiwrapper.bridge.AndroidScaleBridge
import com.kpf.productionline.sunmiwrapper.print.SunmiPrinterManager
import com.kpf.productionline.sunmiwrapper.scale.ScaleSerialManager
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
  private lateinit var webViewContainer: FrameLayout
  private lateinit var webView: WebView
  private lateinit var printerManager: SunmiPrinterManager
  private lateinit var scaleManager: ScaleSerialManager
  private val wrapperPrefs by lazy {
    getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
  }
  private val connectivityManager by lazy {
    getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  }

  private var pendingPermissionRequest: PermissionRequest? = null
  private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
  private var isNetworkCallbackRegistered = false
  private var lastKnownNetworkState: Boolean? = null
  private var hasRestoredWebViewState = false
  private var lastLoginRecoveryAt = 0L
  private var hasRunWrapperPwaCacheCleanup = false

  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      handleConnectivityChanged()
    }

    override fun onLost(network: Network) {
      handleConnectivityChanged()
    }

    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
      handleConnectivityChanged()
    }
  }

  private val requestCameraPermissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    val request = pendingPermissionRequest
    pendingPermissionRequest = null
    if (granted) {
      request?.grant(request.resources)
    } else {
      request?.deny()
      toast("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง")
    }
  }

  private val fileChooserLauncher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { activityResult ->
    val callback = pendingFilePathCallback
    pendingFilePathCallback = null
    if (callback == null) return@registerForActivityResult

    if (activityResult.resultCode != Activity.RESULT_OK) {
      callback.onReceiveValue(null)
      return@registerForActivityResult
    }

    val data = activityResult.data
    val uris = WebChromeClient.FileChooserParams.parseResult(activityResult.resultCode, data)
    if (uris != null && uris.isNotEmpty()) {
      callback.onReceiveValue(uris)
      return@registerForActivityResult
    }

    val singleUri = data?.data
    if (singleUri != null) {
      callback.onReceiveValue(arrayOf(singleUri))
    } else {
      callback.onReceiveValue(null)
    }
  }

  private val initialUrl: String by lazy {
    getString(R.string.web_app_url).trim()
  }

  private val trustedHosts: Set<String> by lazy {
    resources.getStringArray(R.array.trusted_web_hosts)
      .map { it.trim().lowercase() }
      .filter { it.isNotBlank() }
      .toSet()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    webViewContainer = findViewById(R.id.web_view_container)
    webView = findViewById(R.id.main_web_view)
    printerManager = SunmiPrinterManager(this)
    scaleManager = ScaleSerialManager(
      context = this,
      onStatusChanged = ::dispatchScaleStatusToWebView,
      onWeightUpdated = ::dispatchScaleWeightToWebView,
    )
    lastKnownNetworkState = isNetworkAvailable()

    configureWebView()
    prepareWebViewForFreshWebAssets()

    hasRestoredWebViewState = savedInstanceState?.let { restoreWebViewState(it) } == true
    if (!hasRestoredWebViewState) {
      val launchUrl = resolveLaunchUrl()
      if (isTrustedUrl(launchUrl)) {
        webView.loadUrl(launchUrl)
      } else {
        toast("กรุณาตรวจสอบ web_app_url และ trusted_web_hosts")
      }
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    if (::webView.isInitialized) {
      webView.saveState(outState)
      persistLastSuccessfulUrl(webView.url)
      persistCookiesForInitialUrl(webView.url)
      CookieManager.getInstance().flush()
    }
    super.onSaveInstanceState(outState)
  }

  override fun onStart() {
    super.onStart()
    printerManager.bind()
    registerNetworkCallback()
    dispatchConnectivityStatusToWebView()
  }

  override fun onResume() {
    super.onResume()
    webView.resumeTimers()
    webView.onResume()
    recoverWebViewIfNeeded()
  }

  override fun onStop() {
    persistCookiesForInitialUrl(webView.url)
    CookieManager.getInstance().flush()
    unregisterNetworkCallback()
    super.onStop()
    printerManager.unbind()
  }

  override fun onPause() {
    persistCookiesForInitialUrl(webView.url)
    CookieManager.getInstance().flush()
    webView.onPause()
    webView.pauseTimers()
    super.onPause()
  }

  override fun onDestroy() {
    pendingPermissionRequest?.deny()
    pendingPermissionRequest = null
    pendingFilePathCallback?.onReceiveValue(null)
    pendingFilePathCallback = null

    scaleManager.destroy()
    webView.removeJavascriptInterface("AndroidPrinter")
    webView.removeJavascriptInterface("AndroidScale")
    webView.removeJavascriptInterface("AndroidDiagnostics")
    webView.stopLoading()
    webView.loadUrl("about:blank")
    webView.webChromeClient = null
    webView.webViewClient = WebViewClient()
    webView.destroy()

    super.onDestroy()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    Log.i(
      TAG,
      "Configuration changed: keyboard=${newConfig.keyboard}, keyboardHidden=${newConfig.keyboardHidden}, navigation=${newConfig.navigation}"
    )
    persistLastSuccessfulUrl(webView.url)
    persistCookiesForInitialUrl(webView.url)
    CookieManager.getInstance().flush()
    dispatchConnectivityStatusToWebView()
    dispatchScaleStatusToWebView(JSONObject(scaleManager.getState()))
  }

  private fun configureWebView() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      webView.settings.safeBrowsingEnabled = true
    }

    val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    if (isDebuggable) {
      WebView.setWebContentsDebuggingEnabled(true)
    }

    with(webView.settings) {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = false
      allowContentAccess = true
      setSupportMultipleWindows(false)
      mediaPlaybackRequiresUserGesture = false
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      cacheMode = WebSettings.LOAD_DEFAULT
      if (!userAgentString.contains(WRAPPER_USER_AGENT_TOKEN, ignoreCase = true)) {
        userAgentString = "${userAgentString.trim()} $WRAPPER_USER_AGENT_TOKEN".trim()
      }
    }

    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
    restoreCookiesForInitialUrl()

    webView.addJavascriptInterface(
      AndroidPrinterBridge(this, printerManager),
      "AndroidPrinter"
    )
    webView.addJavascriptInterface(
      AndroidScaleBridge(scaleManager),
      "AndroidScale"
    )
    webView.addJavascriptInterface(
      AndroidDiagnosticsBridge(),
      "AndroidDiagnostics"
    )

    webView.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest?) {
        runOnUiThread {
          handleWebPermissionRequest(request)
        }
      }

      override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
      ): Boolean {
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = filePathCallback

        if (filePathCallback == null) {
          return false
        }

        return try {
          val chooserIntent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
          }
          fileChooserLauncher.launch(chooserIntent)
          true
        } catch (error: Exception) {
          pendingFilePathCallback?.onReceiveValue(null)
          pendingFilePathCallback = null
          toast("ไม่สามารถเปิดตัวเลือกรูปภาพได้")
          false
        }
      }

      override fun onJsAlert(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
      ): Boolean {
        if (isFinishing || isDestroyed) {
          result?.cancel()
          return true
        }

        AlertDialog.Builder(this@MainActivity)
          .setMessage(message ?: "")
          .setCancelable(true)
          .setPositiveButton(android.R.string.ok) { _, _ ->
            result?.confirm()
          }
          .setOnCancelListener {
            result?.cancel()
          }
          .show()

        return true
      }

      override fun onJsConfirm(
        view: WebView?,
        url: String?,
        message: String?,
        result: JsResult?
      ): Boolean {
        if (isFinishing || isDestroyed) {
          result?.cancel()
          return true
        }

        AlertDialog.Builder(this@MainActivity)
          .setMessage(message ?: "")
          .setCancelable(true)
          .setPositiveButton(android.R.string.ok) { _, _ ->
            result?.confirm()
          }
          .setNegativeButton(android.R.string.cancel) { _, _ ->
            result?.cancel()
          }
          .setOnCancelListener {
            result?.cancel()
          }
          .show()

        return true
      }

      override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
        if (consoleMessage != null) {
          Log.i(
            TAG,
            "WebView console ${consoleMessage.messageLevel()} " +
              "${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} ${consoleMessage.message()}"
          )
        }
        return super.onConsoleMessage(consoleMessage)
      }
    }

    webView.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?
      ): Boolean {
        val targetUrl = request?.url ?: return true
        if (request.isForMainFrame && shouldRecoverUnexpectedLogin(targetUrl)) {
          recoverSessionAndReloadLastUrl()
          return true
        }
        return !isTrustedUrl(targetUrl)
      }

      override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        persistLastSuccessfulUrl(url)
        persistCookiesForInitialUrl(url)
        runWrapperPwaCacheCleanupOnce(url)
        dispatchConnectivityStatusToWebView()
        dispatchScaleStatusToWebView(JSONObject(scaleManager.getState()))
      }

      override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?
      ) {
        super.onReceivedError(view, request, error)
        val failingUrl = request?.url?.toString()
        val isMainFrame = request?.isForMainFrame == true
        val errorCode = error?.errorCode ?: return
        if (isMainFrame) {
          Log.e(TAG, "Main-frame WebView error code=$errorCode url=$failingUrl description=${error.description}")
        }
        if (!shouldHandleMainFrameFailure(failingUrl, isMainFrame) || !isOfflineErrorCode(errorCode)) {
          return
        }

        val retryUrl = normalizeOfflineRetryUrl(failingUrl)
        view?.post {
          view.loadDataWithBaseURL(
            retryUrl,
            buildOfflineFallbackHtml(retryUrl),
            "text/html",
            "utf-8",
            retryUrl
          )
        }
      }

      override fun onReceivedHttpError(
        view: WebView?,
        request: WebResourceRequest?,
        errorResponse: WebResourceResponse?
      ) {
        super.onReceivedHttpError(view, request, errorResponse)
        if (request?.isForMainFrame == true) {
          Log.e(
            TAG,
            "Main-frame HTTP error status=${errorResponse?.statusCode} url=${request.url}"
          )
        }
      }

      override fun onRenderProcessGone(
        view: WebView?,
        detail: RenderProcessGoneDetail?
      ): Boolean {
        val failedView = view ?: return false
        val didCrash = detail?.didCrash() == true
        Log.e(TAG, "WebView renderer exited didCrash=$didCrash; rebuilding WebView")
        recoverFromRendererProcessLoss(failedView, didCrash)
        return true
      }

      @Suppress("DEPRECATION")
      override fun onReceivedSslError(
        view: WebView?,
        handler: SslErrorHandler?,
        error: SslError?
      ) {
        handler?.cancel()
      }
    }
  }

  private fun prepareWebViewForFreshWebAssets() {
    webView.clearFormData()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      runCatching {
        ServiceWorkerController.getInstance()
          .serviceWorkerWebSettings
          .cacheMode = WebSettings.LOAD_DEFAULT
      }.onFailure { error ->
        Log.w(TAG, "Unable to configure the WebView service worker cache mode", error)
      }
    }
  }

  private fun recoverFromRendererProcessLoss(failedView: WebView, didCrash: Boolean) {
    if (isFinishing || isDestroyed) {
      return
    }

    val recoveryUrl = resolveLaunchUrl()
    Log.e(TAG, "Recovering WebView renderer didCrash=$didCrash url=$recoveryUrl")

    webViewContainer.removeView(failedView)
    runCatching {
      failedView.destroy()
    }.onFailure { error ->
      Log.w(TAG, "Unable to destroy failed WebView instance", error)
    }

    val replacement = WebView(this).apply {
      id = R.id.main_web_view
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    }
    webView = replacement
    webViewContainer.addView(replacement)

    configureWebView()
    prepareWebViewForFreshWebAssets()
    restoreCookiesForInitialUrl()

    if (isTrustedUrl(recoveryUrl)) {
      replacement.loadUrl(recoveryUrl)
    } else {
      Log.e(TAG, "Skipped renderer recovery because URL is not trusted: $recoveryUrl")
    }
  }

  private fun runWrapperPwaCacheCleanupOnce(rawUrl: String?) {
    if (hasRunWrapperPwaCacheCleanup || !isTrustedUrl(rawUrl.orEmpty())) {
      return
    }

    hasRunWrapperPwaCacheCleanup = true

    val script = """
      (function () {
        if (window.__KPF_WRAPPER_PWA_CLEANUP_STARTED__) {
          return;
        }
        window.__KPF_WRAPPER_PWA_CLEANUP_STARTED__ = true;

        var reloadKey = "__kpf_wrapper_pwa_cleanup_reloaded__";
        var pwaCacheNames = {
          "start-url": true,
          "google-fonts-webfonts": true,
          "google-fonts-stylesheets": true,
          "static-font-assets": true,
          "static-image-assets": true,
          "next-image": true,
          "static-audio-assets": true,
          "static-video-assets": true,
          "static-js-assets": true,
          "static-style-assets": true,
          "next-data": true,
          "static-data-assets": true,
          "apis": true,
          "others": true,
          "cross-origin": true
        };
        var isPwaCache = function (cacheName) {
          return typeof cacheName === "string" &&
            (cacheName.indexOf("workbox-") === 0 || pwaCacheNames[cacheName]);
        };

        var unregisterPromise = navigator.serviceWorker && navigator.serviceWorker.getRegistrations
          ? navigator.serviceWorker.getRegistrations().then(function (registrations) {
              return Promise.all(registrations.map(function (registration) {
                return registration.unregister();
              }));
            })
          : Promise.resolve([]);

        var cacheDeletePromise = window.caches && window.caches.keys
          ? window.caches.keys().then(function (cacheNames) {
              return Promise.all(cacheNames.filter(isPwaCache).map(function (cacheName) {
                return window.caches.delete(cacheName);
              }));
            })
          : Promise.resolve([]);

        Promise.all([unregisterPromise, cacheDeletePromise])
          .then(function (results) {
            var didUnregister = results[0].some(Boolean);
            var didDeleteCache = results[1].some(Boolean);
            var didCleanup = didUnregister || didDeleteCache;
            console.info("KPF wrapper PWA cleanup", {
              serviceWorkers: results[0].length,
              caches: results[1].length,
              didCleanup: didCleanup
            });

            if (didCleanup && !window.sessionStorage.getItem(reloadKey)) {
              window.sessionStorage.setItem(reloadKey, "1");
              window.setTimeout(function () {
                window.location.reload();
              }, 150);
            }
          })
          .catch(function (error) {
            console.warn("KPF wrapper PWA cleanup failed", error);
          });
      })();
    """.trimIndent()

    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun restoreWebViewState(savedInstanceState: Bundle): Boolean {
    return runCatching {
      val restored = webView.restoreState(savedInstanceState)
      restored != null && restored.size > 0
    }.getOrDefault(false)
  }

  private fun recoverWebViewIfNeeded() {
    if (!::webView.isInitialized) {
      return
    }

    val currentUrl = webView.url?.trim().orEmpty()
    if (currentUrl.isNotBlank() && !currentUrl.equals("about:blank", ignoreCase = true)) {
      return
    }

    val recoveryUrl = resolveLaunchUrl()
    if (!isTrustedUrl(recoveryUrl)) {
      Log.w(TAG, "Skipped WebView recovery because launch URL is not trusted")
      return
    }

    Log.w(TAG, "Recovering WebView after blank/empty resume state -> $recoveryUrl")
    restoreCookiesForInitialUrl()
    webView.loadUrl(recoveryUrl)
  }

  private fun shouldRecoverUnexpectedLogin(targetUri: Uri): Boolean {
    if (!isTrustedUrl(targetUri) || !isLoginUrl(targetUri)) {
      return false
    }

    val lastSuccessfulUrl = wrapperPrefs.getString(PREF_LAST_SUCCESSFUL_URL, null)
      ?.trim()
      .orEmpty()
    if (!isTrustedUrl(lastSuccessfulUrl) || lastSuccessfulUrl.endsWith("/login")) {
      return false
    }

    val hasCookieSnapshot = wrapperPrefs.getString(PREF_WEBVIEW_COOKIES, null)
      ?.trim()
      .isNullOrEmpty()
      .not()
    if (!hasCookieSnapshot) {
      return false
    }

    val now = SystemClock.elapsedRealtime()
    return now - lastLoginRecoveryAt >= LOGIN_RECOVERY_COOLDOWN_MS
  }

  private fun recoverSessionAndReloadLastUrl() {
    val lastSuccessfulUrl = wrapperPrefs.getString(PREF_LAST_SUCCESSFUL_URL, null)
      ?.trim()
      .orEmpty()
    if (!isTrustedUrl(lastSuccessfulUrl)) {
      return
    }

    lastLoginRecoveryAt = SystemClock.elapsedRealtime()
    Log.w(TAG, "Intercepted unexpected login redirect; restoring cookies and reloading $lastSuccessfulUrl")
    restoreCookiesForInitialUrl()
    CookieManager.getInstance().flush()
    webView.post {
      webView.loadUrl(lastSuccessfulUrl)
    }
  }

  private fun handleWebPermissionRequest(request: PermissionRequest?) {
    val safeRequest = request ?: return
    val needsCamera = safeRequest.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
    if (!needsCamera) {
      safeRequest.deny()
      return
    }

    val hasCameraPermission = ContextCompat.checkSelfPermission(
      this,
      Manifest.permission.CAMERA
    ) == PackageManager.PERMISSION_GRANTED

    if (hasCameraPermission) {
      safeRequest.grant(safeRequest.resources)
      return
    }

    pendingPermissionRequest?.deny()
    pendingPermissionRequest = safeRequest
    requestCameraPermissionLauncher.launch(Manifest.permission.CAMERA)
  }

  private fun isTrustedUrl(rawUrl: String): Boolean {
    return try {
      val parsed = Uri.parse(rawUrl)
      isTrustedUrl(parsed)
    } catch (_: Exception) {
      false
    }
  }

  private fun isTrustedUrl(uri: Uri): Boolean {
    if (uri.scheme?.lowercase() != "https") {
      return false
    }

    val host = uri.host?.lowercase() ?: return false
    return trustedHosts.any { trustedHost ->
      host == trustedHost || host.endsWith(".$trustedHost")
    }
  }

  private fun isLoginUrl(uri: Uri): Boolean {
    val normalizedPath = uri.path?.trimEnd('/').orEmpty()
    return normalizedPath == "/login"
  }

  private fun isNetworkAvailable(): Boolean {
    return try {
      val activeNetwork = connectivityManager.activeNetwork ?: return false
      val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    } catch (_: Exception) {
      false
    }
  }

  private fun handleConnectivityChanged() {
    val isOnline = isNetworkAvailable()
    if (lastKnownNetworkState == isOnline) {
      return
    }
    lastKnownNetworkState = isOnline
    dispatchConnectivityStatusToWebView(isOnline)
  }

  private fun registerNetworkCallback() {
    if (isNetworkCallbackRegistered) {
      return
    }

    try {
      connectivityManager.registerDefaultNetworkCallback(networkCallback)
      isNetworkCallbackRegistered = true
    } catch (_: Exception) {
      isNetworkCallbackRegistered = false
    }
  }

  private fun unregisterNetworkCallback() {
    if (!isNetworkCallbackRegistered) {
      return
    }

    try {
      connectivityManager.unregisterNetworkCallback(networkCallback)
    } catch (_: Exception) {
      // Ignore cleanup failures from platform-specific WebView/ROM behavior.
    } finally {
      isNetworkCallbackRegistered = false
    }
  }

  private fun dispatchConnectivityStatusToWebView(isOnline: Boolean = isNetworkAvailable()) {
    if (!::webView.isInitialized) {
      return
    }

    val script = """
      window.__KPF_WRAPPER_ONLINE__ = ${if (isOnline) "true" else "false"};
      window.dispatchEvent(new CustomEvent("kpf-wrapper-network-change", {
        detail: {
          online: ${if (isOnline) "true" else "false"},
          source: "android-wrapper"
        }
      }));
    """.trimIndent()

    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun dispatchScaleStatusToWebView(payload: JSONObject) {
    if (!::webView.isInitialized) {
      return
    }

    val payloadJson = JSONObject.quote(payload.toString())
    val script = """
      try {
        const detail = JSON.parse($payloadJson);
        window.__KPF_SCALE_STATUS__ = detail;
        window.dispatchEvent(new CustomEvent("kpf-scale-status-change", { detail }));
      } catch (error) {
        console.error("Failed to dispatch scale status", error);
      }
    """.trimIndent()

    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun dispatchScaleWeightToWebView(payload: JSONObject) {
    if (!::webView.isInitialized) {
      return
    }

    val payloadJson = JSONObject.quote(payload.toString())
    val script = """
      try {
        const detail = JSON.parse($payloadJson);
        window.__KPF_SCALE_WEIGHT__ = detail;
        window.dispatchEvent(new CustomEvent("kpf-scale-weight", { detail }));
      } catch (error) {
        console.error("Failed to dispatch scale weight", error);
      }
    """.trimIndent()

    webView.post {
      webView.evaluateJavascript(script, null)
    }
  }

  private fun toast(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  }

  private fun normalizeCookieScopeUrl(rawUrl: String?): String {
    if (rawUrl.isNullOrBlank()) {
      return initialUrl
    }
    if (!isTrustedUrl(rawUrl)) {
      return initialUrl
    }
    return rawUrl
  }

  private fun resolveLaunchUrl(): String {
    val stored = wrapperPrefs.getString(PREF_LAST_SUCCESSFUL_URL, null)
    val normalizedStored = normalizeCookieScopeUrl(stored)
    if (!isNetworkAvailable() && isTrustedUrl(normalizedStored)) {
      return normalizedStored
    }
    return initialUrl
  }

  private fun persistLastSuccessfulUrl(rawUrl: String?) {
    val url = rawUrl?.trim().orEmpty()
    if (!isTrustedUrl(url)) {
      return
    }

    wrapperPrefs.edit()
      .putString(PREF_LAST_SUCCESSFUL_URL, url)
      .apply()
  }

  private fun normalizeOfflineRetryUrl(rawUrl: String?): String {
    val url = rawUrl?.trim().orEmpty()
    if (isTrustedUrl(url)) {
      return url
    }
    return resolveLaunchUrl()
  }

  private fun shouldHandleMainFrameFailure(rawUrl: String?, isMainFrame: Boolean): Boolean {
    if (!isMainFrame || rawUrl.isNullOrBlank()) {
      return false
    }
    if (rawUrl.startsWith("data:", ignoreCase = true)) {
      return false
    }
    return isTrustedUrl(rawUrl)
  }

  private fun isOfflineErrorCode(errorCode: Int): Boolean {
    return errorCode == WebViewClient.ERROR_HOST_LOOKUP
      || errorCode == WebViewClient.ERROR_CONNECT
      || errorCode == WebViewClient.ERROR_TIMEOUT
      || errorCode == WebViewClient.ERROR_IO
      || errorCode == WebViewClient.ERROR_UNKNOWN
  }

  private fun buildOfflineFallbackHtml(retryUrl: String): String {
    val safeRetryUrl = JSONObject.quote(retryUrl)
    return """
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Offline</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #102c57;
              color: #ffffff;
              font-family: Arial, sans-serif;
              padding: 24px;
              box-sizing: border-box;
            }
            .card {
              width: min(100%, 420px);
              background: rgba(255, 255, 255, 0.08);
              border: 1px solid rgba(244, 192, 37, 0.35);
              border-radius: 18px;
              padding: 24px;
              box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
            }
            h1 {
              margin: 0 0 12px;
              font-size: 22px;
            }
            p {
              margin: 0 0 12px;
              line-height: 1.5;
              color: rgba(255, 255, 255, 0.88);
            }
            button {
              margin-top: 10px;
              width: 100%;
              border: 0;
              border-radius: 12px;
              padding: 14px 16px;
              font-size: 15px;
              font-weight: 700;
              background: #f4c025;
              color: #102c57;
            }
            code {
              display: block;
              margin-top: 12px;
              word-break: break-word;
              color: #f7df88;
            }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>Offline mode</h1>
            <p>The wrapper cannot reach the network right now.</p>
            <p>If this device has opened the work page online before, reconnect once and the cached page will be available on the next offline launch.</p>
            <button onclick="window.location.href = ${safeRetryUrl};">Retry</button>
            <code>${retryUrl}</code>
          </main>
        </body>
      </html>
    """.trimIndent()
  }

  private fun persistCookiesForInitialUrl(rawUrl: String?) {
    val scopeUrl = normalizeCookieScopeUrl(rawUrl)
    val rawCookie = CookieManager.getInstance().getCookie(scopeUrl)?.trim().orEmpty()
    if (rawCookie.isBlank()) {
      // Keep the last known cookie snapshot instead of clearing it.
      // Some WebView/ROM states can return empty cookies transiently on lifecycle events.
      return
    }
    wrapperPrefs.edit()
      .putString(PREF_WEBVIEW_COOKIES, rawCookie)
      .putString(PREF_WEBVIEW_COOKIE_SCOPE_URL, scopeUrl)
      .apply()
  }

  private fun restoreCookiesForInitialUrl() {
    val rawCookie = wrapperPrefs.getString(PREF_WEBVIEW_COOKIES, null)?.trim().orEmpty()
    if (rawCookie.isBlank()) {
      return
    }
    val scopeUrl = normalizeCookieScopeUrl(
      wrapperPrefs.getString(PREF_WEBVIEW_COOKIE_SCOPE_URL, initialUrl)
    )

    val cookieManager = CookieManager.getInstance()
    rawCookie.split(";")
      .map { it.trim() }
      .filter { cookie -> cookie.contains("=") }
      .forEach { cookiePair ->
        cookieManager.setCookie(scopeUrl, "$cookiePair; Path=/")
        cookieManager.setCookie(initialUrl, "$cookiePair; Path=/")
      }
    cookieManager.flush()
  }

  companion object {
    private const val TAG = "MainActivity"
    private const val LOGIN_RECOVERY_COOLDOWN_MS = 2_500L
    private const val PREFS_NAME = "wrapper_auth"
    private const val PREF_WEBVIEW_COOKIES = "webview_cookies"
    private const val PREF_WEBVIEW_COOKIE_SCOPE_URL = "webview_cookie_scope_url"
    private const val PREF_LAST_SUCCESSFUL_URL = "last_successful_url"
    private const val WRAPPER_USER_AGENT_TOKEN = "KPF-SUNMI-WRAPPER/1.0"
  }
}
