import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const componentPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScalePageClient.js"
);

function readSource() {
  return fs.readFileSync(componentPath, "utf8");
}

test("create Lot bootstraps product config instead of requiring a prior save", () => {
  const source = readSource();

  assert.match(
    source,
    /async function persistSelectedProductConfig\(/,
    "shared product config persistence helper should exist"
  );
  assert.match(
    source,
    /const persistedConfig = await persistSelectedProductConfig\(\);[\s\S]*createScaleLot\(\{[\s\S]*productConfigId,/,
    "handleCreateLot should persist missing config before creating the lot"
  );
  assert.doesNotMatch(
    source,
    /disabled=\{\s*isCreatingLot\s*\|\|\s*!selectedProductCode\s*\|\|\s*!selectedProduct\?\.configId\s*\}/,
    "create Lot button should not stay disabled solely because configId is missing"
  );
});

test("product picker configures lot min and tare before starting work", () => {
  const source = readSource();
  const selectProductStart = source.indexOf("function selectProduct(productCode)");
  const selectProductEnd = source.indexOf("function selectLotOption", selectProductStart);
  const selectProductSource = source.slice(selectProductStart, selectProductEnd);

  assert.ok(selectProductStart > -1, "selectProduct should exist");
  assert.doesNotMatch(
    selectProductSource,
    /setIsProductPickerOpen\(false\)/,
    "selecting a product should keep the picker open so the operator can confirm LOT/MIN/TARE"
  );
  assert.match(
    source,
    /async function saveProductPickerSetup\(/,
    "product picker should have a one-step save helper"
  );
  assert.match(
    source,
    /saveProductPickerSetup[\s\S]*persistSelectedProductConfig\(\)/,
    "one-step picker save should persist min/tare product config"
  );
  assert.match(
    source,
    /saveProductPickerSetup[\s\S]*(createScaleLot|setScaleCurrentLot)\(/,
    "one-step picker save should activate the chosen lot"
  );
  assert.match(
    source,
    /ตั้งค่าก่อนเริ่มชั่ง[\s\S]*LOT ปัจจุบัน[\s\S]*น้ำหนักขั้นต่ำ[\s\S]*น้ำหนักภาชนะ[\s\S]*ใช้สินค้านี้/,
    "picker should expose LOT, minimum weight, tare, and a single confirm action"
  );
});

test("settings menu hides product settings after picker setup owns product configuration", () => {
  const source = readSource();
  const settingsMenuStart = source.indexOf("actions={(");
  const settingsMenuEnd = source.indexOf("</WeightScalePrimaryHeader>", settingsMenuStart);
  const settingsMenuSource = source.slice(settingsMenuStart, settingsMenuEnd);

  assert.ok(settingsMenuStart > -1, "settings menu should be rendered in the header actions");
  assert.match(
    settingsMenuSource,
    /openSettingsPanel\("config"\)/,
    "settings menu should still expose connection config"
  );
  assert.doesNotMatch(
    source,
    /openSettingsPanel\("product"\)|LOT \/ น้ำหนัก/,
    "settings menu should not expose duplicate product settings"
  );
});
