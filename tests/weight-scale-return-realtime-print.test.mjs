import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const returnPagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleReturnPageClient.js"
);

function readReturnSource() {
  return fs.readFileSync(returnPagePath, "utf8");
}

test("return scale uses the inbound stable timing and reset phases", () => {
  const source = readReturnSource();

  assert.match(source, /AUTO_SAVE_STABLE_WINDOW_MS\s*=\s*2500/);
  assert.match(source, /AUTO_SAVE_STABLE_TOLERANCE_KG\s*=\s*0\.01/);
  assert.match(source, /AUTO_SAVE_RESET_THRESHOLD_KG\s*=\s*0\.1/);
  assert.match(source, /autoSaveStateRef\s*=\s*useRef\(\{[\s\S]*phase:\s*"armed"/);
  assert.match(source, /phase:\s*"saving"/);
  assert.match(source, /phase:\s*"awaiting-reset"/);
  assert.match(
    source,
    /currentState\.phase\s*===\s*"awaiting-reset"[\s\S]*currentWeight\s*<=\s*AUTO_SAVE_RESET_THRESHOLD_KG[\s\S]*setSourceItem\(null\)/
  );
});

test("a validated return barcode automatically starts realtime scale streaming", () => {
  const source = readReturnSource();

  assert.match(source, /const autoConnectKey\s*=\s*useMemo/);
  assert.match(source, /sourceItem\?\.barcode/);
  assert.match(
    source,
    /autoConnectKeyRef\.current\s*=\s*autoConnectKey;[\s\S]*startPreview\(\)/
  );
  assert.match(source, /connectWatchdogRef/);
  assert.match(source, /payload\.message\s*\|\|/);
});

test("saved returns auto-print the persisted return barcode in both print modes", () => {
  const source = readReturnSource();

  assert.match(
    source,
    /import\s+\{\s*printWeightScaleLabelViaUsb\s*\}\s+from\s+"@\/features\/production-line\/services\/webUsbPrinter"/
  );
  assert.match(source, /function buildReturnPrintLabel\(/);
  assert.match(source, /barcodeValue:\s*String\(result\.barcode\)/);
  assert.match(source, /labelWidthMm:\s*80/);
  assert.match(source, /labelHeightMm:\s*50/);
  assert.match(source, /await printWeightScaleLabelViaAgent\(nextPrintLabel\)/);
  assert.match(source, /await printWeightScaleLabelViaUsb\(usbDevice, nextPrintLabel\)/);
  assert.match(source, /setLatestReturnLabel\(nextPrintLabel\)/);
});

test("return labels can be reprinted without creating another stock return", () => {
  const source = readReturnSource();
  const reprintStart = source.indexOf("const handleReprintLatestLabel");
  const reprintEnd = source.indexOf("const saveReturn", reprintStart);
  const reprintSource = source.slice(reprintStart, reprintEnd);

  assert.ok(reprintStart > -1, "latest return reprint handler should exist");
  assert.match(reprintSource, /latestReturnLabel/);
  assert.match(reprintSource, /printWeightScaleLabelViaAgent/);
  assert.match(reprintSource, /printWeightScaleLabelViaUsb/);
  assert.doesNotMatch(reprintSource, /createStockReturnRequest/);
});

test("a persisted return waits for scale reset even when printing fails", () => {
  const source = readReturnSource();
  const saveStart = source.indexOf("const saveReturn");
  const saveEnd = source.indexOf("// Auto-Save Logic", saveStart);
  const saveSource = source.slice(saveStart, saveEnd);

  assert.match(saveSource, /const result = await createStockReturnRequest/);
  assert.match(saveSource, /let printErrorMessage = ""/);
  assert.match(saveSource, /catch \(printError\)/);
  assert.match(saveSource, /phase:\s*"awaiting-reset"/);
  assert.doesNotMatch(saveSource, /setSourceItem\(null\)/);
});
