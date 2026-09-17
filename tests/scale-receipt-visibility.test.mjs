import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { assertReceiptCanReprint, isActiveScaleReceipt, resolveActiveReceiptCount } from "../src/lib/scale-receipt-visibility.js";

const active = { id: "receipt-1", barcode: "BC-1", status: "recorded", weighedAt: "2026-09-05T20:00:00Z" };
const voided = { ...active, status: "voided" };

test("recent receipts and fallback counts exclude cancellations and retain zero", () => {
  assert.deepEqual([active, voided].filter(isActiveScaleReceipt), [active]);
  assert.equal(resolveActiveReceiptCount(0, [active, voided]), 0);
  assert.equal(resolveActiveReceiptCount(undefined, [active, voided, { ...active, isTest: true }]), 1);
  assert.equal(resolveActiveReceiptCount(undefined, [voided]), 0);
  assert.equal(isActiveScaleReceipt({}), false);
});

test("reprint checks persisted status and fails closed on stale or unavailable data", async () => {
  await assert.rejects(() => assertReceiptCanReprint(voided, () => { throw new Error("must not request"); }), /ยกเลิก/);
  await assert.rejects(() => assertReceiptCanReprint(active, async () => ({ receipts: [voided] })), /ยกเลิก/);
  await assert.rejects(() => assertReceiptCanReprint(active, async () => ({ receipts: [] })), /ยกเลิก/);
  await assert.rejects(() => assertReceiptCanReprint(active, async () => { throw new Error("offline"); }), /offline/);
  await assertReceiptCanReprint(active, async (params) => {
    assert.equal(params.itemStatus, "confirmed");
    assert.equal(params.search, active.barcode);
    assert.equal(params.includeAll, true);
    return { receipts: [active] };
  });
});

test("both scale pages filter cancelled receipts and check before reprint", () => {
  for (const page of ["WeightScalePageClient", "WeightScaleLivePageClient"]) {
    const source = fs.readFileSync(new URL(`../src/features/production-line/components/${page}.js`, import.meta.url), "utf8");
    assert.match(source, /\.filter\(isActiveScaleReceipt\)/);
    assert.match(source, /await assertReceiptCanReprint\(/);
  }
  const service = fs.readFileSync(new URL("../src/lib/scale/receipts.js", import.meta.url), "utf8");
  const recent = service.slice(service.indexOf("export async function loadScaleRecentReceiptsData"), service.indexOf("export async function loadScaleReceiptReportData"));
  assert.match(recent, /\.eq\("status", "recorded"\)/);
});

test("issue report print and Excel retain status groups and exclude voided grand totals", () => {
  const source = fs.readFileSync(new URL("../src/features/production-line/components/ProductionStockIssueSummaryReportPageClient.js", import.meta.url), "utf8");
  assert.equal(source.match(/const key = `\$\{row.productCode\}\|\$\{row.issueStatus\}`/g)?.length, 2);
  assert.match(source, /filteredRows\.filter\(\(row\) => row.issueStatus !== "voided"\)/);
  assert.match(source, /สรุปรวม \{data.productCode\} \(\{data.statusLabel\}\)/);
  assert.match(source, /productDisplay: `สรุปรวม \$\{productCode\} \(\$\{statusLabel\}\)`/);
  assert.match(source, /สรุปรวมเฉพาะเบิกสำเร็จ/);
});

test("detailed weight receipt page defaults to all records and keeps explicit type filters", () => {
  const service = fs.readFileSync(new URL("../src/lib/scale/receipts.js", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/app/production-line/weight-scale/report/page.js", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../src/features/production-line/components/WeightScaleReportPageClient.js", import.meta.url), "utf8");

  assert.match(service, /recordType = "production"/);
  assert.match(service, /normalizedRecordType === "production"/);
  assert.match(service, /normalizedRecordType === "return"/);
  assert.match(page, /\["all", "production", "return"\]/);
  assert.match(client, /handleRecordTypeChange\("all"\)/);
  assert.match(client, /รายการชั่งคืนนอกช่วงวันที่จะไม่รวมในรายงานนี้/);
  assert.match(client, /filters\.recordType === "production" &&/);
  assert.match(client, /handleFieldChange\("lotNo"/);
  assert.match(service, /receipt\?\.lotNo[\s\S]*=== normalizedLotNo/);
});
