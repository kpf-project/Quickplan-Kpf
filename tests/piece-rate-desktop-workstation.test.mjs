import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluateDesktopPieceRateReadiness,
  isDesktopScaleWindowStable,
  normalizeDesktopScaleReading,
  resolveDesktopScaleStableWeight,
} from "../src/lib/piece-rate-desktop-scale.js";
import {
  buildPieceRateDesktopLabel,
  buildPieceRateLotNo,
} from "../src/lib/piece-rate-desktop-label.js";

test("desktop piece-rate save requires product, employee, fresh connected stable positive weight", () => {
  const ready = evaluateDesktopPieceRateReadiness({
    hasProduct: true,
    hasEmployee: true,
    agentConnected: true,
    portOpen: true,
    isReadingFresh: true,
    isStable: true,
    weightKg: 12.45,
  });
  assert.deepEqual(ready, { canSave: true, reason: "" });

  const unstable = evaluateDesktopPieceRateReadiness({
    hasProduct: true,
    hasEmployee: true,
    agentConnected: true,
    portOpen: true,
    isReadingFresh: true,
    isStable: false,
    weightKg: 12.45,
  });
  assert.deepEqual(unstable, { canSave: false, reason: "กรุณารอให้น้ำหนักนิ่ง" });

  const missingEmployee = evaluateDesktopPieceRateReadiness({
    hasProduct: true,
    hasEmployee: false,
    agentConnected: true,
    portOpen: true,
    isReadingFresh: true,
    isStable: true,
    weightKg: 12.45,
  });
  assert.deepEqual(missingEmployee, { canSave: false, reason: "กรุณาสแกนพนักงาน" });
});

test("desktop scale derives stability when the local agent does not send a stable flag", () => {
  assert.equal(isDesktopScaleWindowStable([
    { weightKg: 12.450, atMs: 0 },
    { weightKg: 12.451, atMs: 400 },
    { weightKg: 12.450, atMs: 800 },
    { weightKg: 12.451, atMs: 1200 },
    { weightKg: 12.450, atMs: 1600 },
  ]), true);
  assert.equal(isDesktopScaleWindowStable([
    { weightKg: 12.450, atMs: 0 },
    { weightKg: 12.450, atMs: 200 },
    { weightKg: 12.450, atMs: 400 },
    { weightKg: 12.450, atMs: 600 },
    { weightKg: 12.450, atMs: 800 },
  ]), false);
});

test("desktop scale stream accepts a valid agent reading and rejects malformed weight", () => {
  assert.deepEqual(
    normalizeDesktopScaleReading({
      weightKg: "12.450",
      unit: "kg",
      raw: "ST,GS,+ 12.450 kg",
      at: "2026-08-03T02:41:23.000Z",
      stable: true,
    }, 1234),
    {
      weightKg: 12.45,
      unit: "kg",
      raw: "ST,GS,+ 12.450 kg",
      at: "2026-08-03T02:41:23.000Z",
      atMs: Date.parse("2026-08-03T02:41:23.000Z"),
      stable: true,
    }
  );
  assert.equal(normalizeDesktopScaleReading({ weightKg: "not-a-number" }, 1234), null);
});

test("piece-rate desktop label is 80 by 50 mm and encodes the server document number", () => {
  const label = buildPieceRateDesktopLabel({
    docNo: "20260803001",
    productCode: "BL0-4004",
    productName: "แครกเกอร์ เคพีเอฟ รสดั้งเดิม 60 กรัม",
    employeeCode: "EMP-001234",
    employeeName: "น.ส. อารีรัตน์ ใจดี",
    weightKg: 12.45,
    countValue: 25,
    wageAmount: 498,
    recordedAt: "2026-08-03T02:41:23.000Z",
  });

  assert.equal(label.widthMm, 80);
  assert.equal(label.heightMm, 50);
  assert.equal(label.barcode.type, "CODE128");
  assert.equal(label.barcode.value, "20260803001");
  assert.equal(label.documentNo, "20260803001");
  assert.equal(label.weightText, "12.450 kg");
  assert.equal(label.title, "ป้ายแยม");
  assert.equal(label.lotNo, "0308264004-1");
  assert.equal(label.countText, undefined);
  assert.equal(label.wageText, undefined);

  assert.equal(buildPieceRateDesktopLabel({
    docNo: "20260803002",
    productCode: "BL0-4004",
    productName: "Test",
    employeeCode: "EMP-001234",
    employeeName: "Test",
    weightKg: 12.45,
    lotNo: "STORED-LOT-001",
  }).lotNo, "STORED-LOT-001");
});

test("piece-rate LOT uses Bangkok production date and the configured shift boundary", () => {
  assert.equal(buildPieceRateLotNo({
    productCode: "BL0-4004",
    recordedAt: "2026-08-03T11:59:00.000Z",
  }), "0308264004-1");
  assert.equal(buildPieceRateLotNo({
    productCode: "BL0-4004",
    recordedAt: "2026-08-03T12:00:59.000Z",
  }), "0308264004-1");
  assert.equal(buildPieceRateLotNo({
    productCode: "BL0-4004",
    recordedAt: "2026-08-03T12:01:00.000Z",
  }), "0308264004-2");
  assert.equal(buildPieceRateLotNo({
    productCode: "BL0-4004",
    recordedAt: "2026-08-03T19:30:00.000Z",
  }), "0308264004-2");
  assert.equal(buildPieceRateLotNo({
    productCode: "WKB-006",
    recordedAt: "2026-08-04T00:00:00.000Z",
  }), "0408260006-1");
});

test("piece-rate bitmap matches the compact jam-label content", () => {
  const bitmapSource = fs.readFileSync(
    new URL("../src/features/attendance/services/pieceRateLabelBitmap.js", import.meta.url),
    "utf8"
  );

  assert.match(bitmapSource, /WIDTH_DOTS = 80 \* DOTS_PER_MM/);
  assert.match(bitmapSource, /HEIGHT_DOTS = 50 \* DOTS_PER_MM/);
  assert.match(bitmapSource, /label\.lotNo/);
  assert.doesNotMatch(bitmapSource, /label\.countText|label\.wageText/);
});

test("desktop weight panel keeps only the primary reading and compact connection state", () => {
  const componentSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.js", import.meta.url),
    "utf8"
  );
  const styleSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.module.css", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(componentSource, /ช่วงชั่ง|ละเอียด|ข้อมูลล่าสุด/);
  assert.match(styleSource, /\.weight\s*\{[^}]*font-size:clamp\(135px,11vw,215px\)/s);
  assert.match(styleSource, /\.stable\s*\{[^}]*font-size:18px/s);
  assert.match(componentSource, /row\.lotNo/);
});

test("desktop save action uses a standalone gold button without a full-width gold bar", () => {
  const styleSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.module.css", import.meta.url),
    "utf8"
  );

  assert.match(styleSource, /\.saveBar\s*\{[^}]*background:transparent/s);
  assert.match(styleSource, /\.saveButton\s*\{[^}]*background:linear-gradient/s);
});

test("desktop scale keeps a confirmed stable weight until the reading actually moves", () => {
  assert.equal(resolveDesktopScaleStableWeight({
    readings: [{ weightKg: 12.45, atMs: 0 }],
    deviceStable: true,
    currentWeightKg: 12.45,
  }), 12.45);

  assert.equal(resolveDesktopScaleStableWeight({
    readings: [{ weightKg: 12.451, atMs: 450 }],
    deviceStable: false,
    previousStableWeightKg: 12.45,
    currentWeightKg: 12.451,
  }), 12.45);

  assert.equal(resolveDesktopScaleStableWeight({
    readings: [{ weightKg: 12.46, atMs: 900 }],
    deviceStable: false,
    previousStableWeightKg: 12.45,
    currentWeightKg: 12.46,
  }), null);
});

test("desktop recent table merges offline outbox rows and shows synchronization status", () => {
  const componentSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.js", import.meta.url),
    "utf8"
  );
  const offlineSource = fs.readFileSync(
    new URL("../src/lib/offline/pieceRateOffline.js", import.meta.url),
    "utf8"
  );

  assert.match(componentSource, /getRecentPieceRateOutboxEntries/);
  assert.match(componentSource, /mergeRecentRows/);
  assert.match(componentSource, /row\.requestId \|\| row\.docNo/);
  assert.match(componentSource, /รอส่งเข้าระบบ/);
  assert.match(componentSource, /ส่งไม่สำเร็จ/);
  assert.match(componentSource, /เข้าระบบแล้ว/);
  assert.match(offlineSource, /export async function getRecentPieceRateOutboxEntries/);
});

test("desktop employee summary loads every document for the selected work date", () => {
  const componentSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.js", import.meta.url),
    "utf8"
  );

  assert.match(componentSource, /dateFrom: workDate,[\s\S]*dateTo: workDate,[\s\S]*printAll: true/);
  assert.doesNotMatch(componentSource, /dateFrom: workDate,[\s\S]*dateTo: workDate,[\s\S]*pageSize: 1000/);
});

test("desktop runtime selection is deferred until after hydration", () => {
  const pageSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(pageSource, /useState\(isDesktopPieceRateRuntime\)/);
  assert.doesNotMatch(pageSource, /isPreviewMode \|\| isDesktopPieceRateRuntime\(\)/);
  assert.match(pageSource, /const \[isDesktopRuntime, setIsDesktopRuntime\] = useState\(false\)/);
  assert.match(pageSource, /setIsDesktopRuntime\(desktopRuntime\)/);
});

test("piece-rate picker pagination forwards gateway cursors for products and employees", () => {
  const pageSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js", import.meta.url),
    "utf8"
  );

  assert.match(pageSource, /productPickerCursorMapRef\.current\[pageNum \+ 1\] = payload\.cursor\?\.next \|\| null/);
  assert.match(pageSource, /\.\.\.\(cursor \? \{ cursor \} : \{\}\)/);
  assert.match(pageSource, /employeePickerCursorMapRef\.current\[pageNum \+ 1\] = payload\?\.cursor\?\.next \|\| null/);
  assert.match(pageSource, /params\.set\("cursor", cursor\)/);
});

test("piece-rate product picker only shows products with configured barcodes", () => {
  const pageSource = fs.readFileSync(
    new URL("../src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js", import.meta.url),
    "utf8"
  );

  assert.match(pageSource, /const selectableProducts = payload\.products\.filter/);
  assert.match(pageSource, /if \(!String\(item\?\.productBarcode \|\| ""\)\.trim\(\)\) return false/);
  assert.doesNotMatch(pageSource, /สินค้านี้ยังไม่ได้ตั้งค่าบาร์โค้ดในระบบ/);
});
