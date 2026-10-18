import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as crypto from "node:crypto";
import { fetchSupabaseRowsByChunks } from "../src/lib/supabaseRangeFetch.js";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
test("SQL Editor installer contains the original schema and reviewed atomic transaction unchanged", () => {
  const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const installer = read("scripts/install-receipt-erp-export.sql");
  assert.ok(installer.includes(read("supabase/migrations/20260715000000_add_erp_wip_receipt_export_history.sql")));
  assert.ok(installer.includes(read("scripts/receipt-erp-export-atomic.sql")));
});
const source = readFileSync(new URL("../src/lib/erp-wip-receipt-export.js", import.meta.url), "utf8");
function service(load = async () => ({ receipts: [] })) {
  const code = source.replace(/^import .*;\r?\n/gm, "").replaceAll("export async function", "async function");
  return new Function("ExcelJS", "ApiError", "getSupabaseAdmin", "loadScaleReceiptReportData", "loadScaleProductsData", "crypto", "fetchSupabaseRowsByChunks", `${code}\nreturn { parseReceiptRows, buildExcelLine, createWorkbookBuffer, previewWipReceiptErpExport, exportWipReceiptErpExcel, downloadWipReceiptErpBatch };`)(ExcelJS, ApiError, () => ({}), load, async () => ({ preset: { departmentId: "dept" } }), crypto, fetchSupabaseRowsByChunks);
}
const receipt = (id, weight, timestamp = "2026-10-14T01:00:00Z") => ({ id, productCode: "WKB-0002", productName: "สินค้า", lotNo: "1410260002-1", netWeightKg: weight, weighedAt: timestamp, productConfigId: "cfg", lotId: "lot", barcode: id, status: "recorded", itemStatus: "available" });

test("large receipt previews bound encoded claim-query URLs and retain every duplicate", async () => {
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  try {
    const receipts = Array.from({ length: 1200 }, () => receipt(crypto.randomUUID(), 1));
    const seen = [];
    const db = { from(table) {
      let ids = [];
      const chain = { select() { return chain; }, eq() { return chain; }, in(_, values) { ids = values; return chain; }, then(resolve) {
        if (table === "production_erp_export_receipts") {
          const encodedLength = ids.reduce((sum, id) => sum + encodeURIComponent(id).length + 3, 0);
          assert.ok(encodedLength <= 1800, `URI too long: ${encodedLength} encoded characters`);
          seen.push(...ids);
        }
        return Promise.resolve({ data: table === "production_erp_export_receipts" ? ids.map(id => ({ receipt_id: id })) : [] }).then(resolve);
      } }; return chain;
    } };
    const result = await service(async () => ({ receipts })).previewWipReceiptErpExport({ supabaseAdmin: db, actorUserId: "actor", filters: { dateFrom: "2026-10-14", dateTo: "2026-10-14" } });
    assert.equal(result.duplicateCount, 1200);
    assert.equal(new Set(seen).size, 1200);
  } finally { if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
});

test("ERP quantity is summed net kg; unit weight is numeric zero formatted 0.00", async () => {
  const s = service();
  const rows = s.parseReceiptRows([receipt("a", 12.123), receipt("b", 10.111)]);
  assert.equal(rows.length, 1);
  const line = s.buildExcelLine(rows[0], "IMM6910/0001");
  assert.equal(line.quantity, 22.234);
  assert.equal(line.unitWeightKg, 0);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await s.createWorkbookBuffer(rows, new Map([["2026-10-14", "IMM6910/0001"]])));
  assert.equal(book.worksheets[0].getCell("I2").value, 22.234);
  assert.equal(book.worksheets[0].getCell("K2").value, 0);
  assert.equal(book.worksheets[0].getCell("K2").numFmt, "0.00");
});

test("lost download retries recover committed batch without allocating again; saved workbook fields survive", async () => {
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  try {
    let loads = 0, commits = 0, committed = null, failDownload = true;
    const batchId = crypto.randomUUID();
    const sourceReceipt = receipt(crypto.randomUUID(), 12.123);
    const s = service(async () => { loads++; return { receipts: [sourceReceipt] }; });
    const batch = { id: batchId, status: "exported", file_name: "saved.xlsx", row_count: 1, document_count: 1, metadata: { filters: { departmentId: "dept" } } };
    const saved = { document_date: "2026-10-14", document_no: "IMM6910/0050", quantity: 12.123, unit_weight_kg: 0,
      trade_code: "WKB-0002", lot_no: "saved-lot", branch_code: "00000", department_code: "KP13", project_code: "0", display_price: -1,
      production_date: "2026-10-13", expiry_date: "2028-10-13", storage_location: "09", unit_price: 3.25, tracking_no: "saved-tracking" };
    const db = {
      from(table) {
        const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; }, order() { return chain; },
          async maybeSingle() { return { data: committed }; }, async single() { return { data: batch }; },
          async range() { if (failDownload) { failDownload = false; return { error: { code: "fixture", message: "lost response" } }; } return { data: [saved] }; },
          then(resolve) { return Promise.resolve({ data: [] }).then(resolve); } };
        return chain;
      },
      async rpc(name, args) { assert.equal(name, "commit_wip_receipt_erp_export"); commits++; committed = { id: batchId, metadata: { requestHash: args.p_request_hash } }; return { data: batchId }; },
    };
    const filters = { dateFrom: "2026-10-14", dateTo: "2026-10-14" };
    const preview = await s.previewWipReceiptErpExport({ supabaseAdmin: db, filters, actorUserId: "actor" });
    const options = { supabaseAdmin: db, filters, actorUserId: "actor", requestId: crypto.randomUUID(), previewToken: preview.previewToken };
    await assert.rejects(s.exportWipReceiptErpExcel(options), /ไม่สามารถอ่าน/);
    const beforeRetry = loads;
    const result = await s.exportWipReceiptErpExcel(options);
    assert.equal(loads, beforeRetry);
    assert.equal(commits, 1);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(result.buffer);
    const sheet = book.worksheets[0];
    assert.equal(sheet.getCell("B2").value, "IMM6910/0050");
    assert.equal(sheet.getCell("J2").value, 3.25);
    assert.equal(sheet.getCell("M2").value, "saved-tracking");
    assert.equal(sheet.getCell("N2").value, "09");
    assert.equal(sheet.getCell("O2").value, "13/10/2026");
    assert.equal(sheet.getCell("P2").value, "13/10/2028");
    await assert.rejects(s.downloadWipReceiptErpBatch({ supabaseAdmin: db, batchId: "bad" }), /รหัสเอกสาร/);
  } finally { if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; }
});

test("preview scopes department on server, forwards LOT/product filters, detects duplicates and binds export to actor and receipt snapshot", async () => {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
  try {
    let input;
    let receipts = [receipt("a", 12.123)];
    const s = service(async (_, filters) => { input = filters; return { receipts }; });
    const db = { from(table) { const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; }, maybeSingle: async () => ({ data: null }), then(resolve) { return Promise.resolve({ data: table === "production_erp_export_receipts" ? [{ receipt_id: "a" }] : [] }).then(resolve); } }; return chain; } };
    const filters = { departmentId: "untrusted-other-dept", dateFrom: "2026-10-14", dateTo: "2026-10-14", lotNo: "1410260002-1", productCodes: ["WKB-0002"] };
    const preview = await s.previewWipReceiptErpExport({ supabaseAdmin: db, filters, actorUserId: "actor" });
    assert.equal(input.departmentId, "dept");
    assert.equal(input.lotNo, filters.lotNo);
    assert.deepEqual(input.productCodes, filters.productCodes);
    assert.equal(input.isTest, false);
    assert.equal(input.recordType, "production");
    assert.equal(preview.duplicateCount, 1);
    assert.equal(preview.documents[0].documentNo, "IMM6910/0001");
    const options = { supabaseAdmin: db, filters, actorUserId: "actor", previewToken: preview.previewToken, requestId: crypto.randomUUID() };
    await assert.rejects(s.exportWipReceiptErpExcel({ ...options, actorUserId: "other" }), /ผู้ใช้อื่น/);
    await assert.rejects(s.exportWipReceiptErpExcel({ ...options, previewToken: preview.previewToken + "bad" }), /พรีวิวไม่ถูกต้อง/);
    receipts = [receipt("a", 13)];
    await assert.rejects(s.exportWipReceiptErpExcel(options), /ข้อมูลเปลี่ยน/);
    await assert.rejects(s.exportWipReceiptErpExcel({ ...options, documentNumbers: { "2026-10-14": "IMM6910/0009" } }), /ผู้ดูแลระบบ/);
    await assert.rejects(s.exportWipReceiptErpExcel({ ...options, filters: { ...filters, dateFrom: "2026-02-30" } }), /วันที่/);
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("uses Bangkok receipt date, preserves decimal sums, rejects missing/invalid receipt facts", () => {
  const s = service();
  assert.equal(s.parseReceiptRows([receipt("a", 0.1, "2026-10-14T18:00:00Z")])[0].documentDate, "2026-10-15");
  for (const bad of [receipt("a", -1), receipt("a", 0), receipt("a", NaN), receipt("a", 1, null), { ...receipt("a", 1), lotNo: "" }]) {
    assert.throws(() => s.parseReceiptRows([bad]));
  }
});
