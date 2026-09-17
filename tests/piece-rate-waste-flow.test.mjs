import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const scannerPath = "src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js";
const formPath = "src/app/production-line/attendance/piece-rate-scan/PieceRateWasteForm.js";
const workflowTabsPath = "src/features/attendance/components/PieceRateWorkflowTabs.js";

test("piece-rate scanner offers an isolated waste mode after product scan", () => {
  const source = readFileSync(scannerPath, "utf8");

  assert.match(source, /handleSelectMode\("waste"\)/);
  assert.match(source, /ชั่งของเสีย/);
  assert.match(source, /scanMode === "waste"/);
  assert.match(source, /dynamic\(\(\) => import\("\.\/PieceRateWasteForm"\)/);
  assert.match(source, /<PieceRateWasteForm/);
  assert.match(source, /setStage\("form"\)/);
});

test("desktop waste mode supports product selection, barcode scanning and the desktop scale agent", () => {
  const scanner = readFileSync(scannerPath, "utf8");
  const form = readFileSync(formPath, "utf8");
  const tabs = readFileSync(workflowTabsPath, "utf8");

  assert.match(tabs, /mode: "waste", label: "ชั่งของเสีย"/);
  assert.match(scanner, /getAllCachedPieceRateProducts/);
  assert.match(scanner, /handleWasteProductSelection/);
  assert.match(scanner, /desktopWorkflowMode === "weigh-in" \|\| desktopWorkflowMode === "waste"/);
  assert.match(form, /desktopScale\?\.weightKg/);
  assert.match(form, /desktopScale\?\.isStable/);
});

test("piece-rate waste form uses the same realtime Sunmi scale bridge and explicit stable save", () => {
  assert.equal(existsSync(formPath), true, "piece-rate waste scale form must exist");
  const source = readFileSync(formPath, "utf8");

  assert.match(source, /baudRate:\s*9600/);
  assert.match(source, /dataBits:\s*8/);
  assert.match(source, /stopBits:\s*1/);
  assert.match(source, /parity:\s*"N"/);
  assert.match(source, /previewCommand:\s*"SI"/);
  assert.match(source, /stableCommand:\s*"S"/);
  assert.match(source, /previewIntervalMs:\s*450/);
  assert.match(source, /stableReadTimeoutMs:\s*2500/);
  assert.match(source, /startScalePreview/);
  assert.match(source, /SCALE_STATUS_CHANGE_EVENT/);
  assert.match(source, /SCALE_WEIGHT_CHANGE_EVENT/);
  assert.match(source, /readStableScaleWeight/);
  assert.match(source, /createSubmitLock/);
  assert.match(source, /submitPieceRateWasteLog/);
  assert.match(source, /บันทึกของเสีย/);
  assert.doesNotMatch(source, /employeeCode|submitPieceRateLog|production-stock\/waste/);
});

test("piece-rate waste form exposes change product button to re-select or rescan product without refresh", () => {
  const form = readFileSync(formPath, "utf8");
  const scanner = readFileSync(scannerPath, "utf8");

  assert.match(form, /onChangeProduct/);
  assert.match(form, /เปลี่ยนสินค้า/);
  assert.match(scanner, /<PieceRateWasteForm[\s\S]*onChangeProduct=\{handleChangeLockedProduct\}/);
});

