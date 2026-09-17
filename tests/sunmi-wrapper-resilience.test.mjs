import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainActivityPath = new URL(
  "../android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/MainActivity.kt",
  import.meta.url,
);
const gradlePath = new URL("../android/sunmi-v3-wrapper/app/build.gradle.kts", import.meta.url);
const diagnosticsBridgePath = new URL(
  "../android/sunmi-v3-wrapper/app/src/main/java/com/kpf/productionline/sunmiwrapper/bridge/AndroidDiagnosticsBridge.kt",
  import.meta.url,
);

test("uses normal HTTP caching and does not erase the WebView cache on launch", async () => {
  const source = await readFile(mainActivityPath, "utf8");
  assert.match(source, /cacheMode\s*=\s*WebSettings\.LOAD_DEFAULT/);
  assert.doesNotMatch(source, /clearCache\(true\)/);
});

test("recovers after the Android WebView renderer exits", async () => {
  const source = await readFile(mainActivityPath, "utf8");
  assert.match(source, /override fun onRenderProcessGone/);
  assert.match(source, /recoverFromRendererProcessLoss/);
});

test("pauses and resumes the WebView with the activity lifecycle", async () => {
  const source = await readFile(mainActivityPath, "utf8");
  assert.match(source, /webView\.onPause\(\)/);
  assert.match(source, /webView\.onResume\(\)/);
});

test("bumps the wrapper release to 1.0.4", async () => {
  const source = await readFile(gradlePath, "utf8");
  assert.match(source, /versionCode\s*=\s*4/);
  assert.match(source, /versionName\s*=\s*"1\.0\.4"/);
});

test("exposes runtime diagnostics to Android logcat", async () => {
  const [mainSource, bridgeSource] = await Promise.all([
    readFile(mainActivityPath, "utf8"),
    readFile(diagnosticsBridgePath, "utf8"),
  ]);
  assert.match(mainSource, /AndroidDiagnosticsBridge\(\)/);
  assert.match(mainSource, /"AndroidDiagnostics"/);
  assert.match(bridgeSource, /@JavascriptInterface/);
  assert.match(bridgeSource, /fun report\(/);
});
