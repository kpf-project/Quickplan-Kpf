import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { buildProductionInputOutputReport, mergeManualJamUsageRows } from "../src/lib/production-input-output-report.js";

const source = readFileSync("src/lib/production-jam-usage.js", "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const request = { requestId: "68ef56c8-3836-450a-8194-2ada1074f095", usageDate: "2026-10-14", goodsCode: "M04-0088", lotNo: "261007", actorUserId: "actor", allocations: [{ targetProductCode: "WKB-0064", weightKg: 200 }, { targetProductCode: "WKB-0065", weightKg: 230 }] };
const outputs = [{ code: "WKB-0064", name: "สินค้า A", jamCodes: ["M04-0088"] }, { code: "WKB-0065", name: "สินค้า B", jamCodes: ["M04-0088"] }];
function service({ error = null, replay = [] } = {}) {
  const inserts = [];
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const db = { from(table) {
    if (table === "products_cache") return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    return {
      insert(records) { inserts.push(records); return { select: async () => ({ error, data: records.map((row, index) => ({ ...row, id: String(index), status: "confirmed" })) }) }; },
      select: () => ({ eq: async () => ({ data: replay, error: null }) }),
    };
  } };
  const context = vm.createContext({ createHash, ApiError, getSupabaseAdmin: () => db });
  vm.runInContext(source + "\nthis.create = createProductionJamUsageBatch;", context);
  return { create: (value, products = outputs) => context.create(value, products, db), inserts };
}

test("saves every selected output in one atomic insert with trusted names", async () => {
  const api = service();
  const result = await api.create(request);
  assert.equal(api.inserts.length, 1);
  assert.equal(api.inserts[0].length, 2);
  assert.equal(result.entries.reduce((sum, row) => sum + row.weightKg, 0), 430);
  assert.equal(api.inserts[0][0].target_product_name_snapshot, "สินค้า A");
});

test("rejects duplicate outputs, incompatible BOM, invalid dates and nonpositive weights before inserting", async () => {
  const api = service();
  for (const body of [
    { ...request, allocations: [request.allocations[0], request.allocations[0]] },
    { ...request, allocations: [{ targetProductCode: "OTHER", weightKg: 200 }] },
    { ...request, allocations: [{ targetProductCode: "WKB-0064", weightKg: 0 }] },
    { ...request, usageDate: "2026-02-30" },
    { ...request, allocations: [null] },
  ]) await assert.rejects(api.create(body), (error) => error.status === 400);
  assert.equal(api.inserts.length, 0);
  await assert.rejects(api.create(request, []), (error) => error.status === 400);
});

test("retries return the original batch, while changed data or actor conflicts fail closed", async () => {
  const replay = request.allocations.map((row, index) => ({ id: String(index), target_product_code: row.targetProductCode, usage_date: request.usageDate, goods_code: request.goodsCode, lot_no: request.lotNo, weight_kg: row.weightKg, created_by: request.actorUserId, status: "confirmed" }));
  const api = service({ error: { code: "23505" }, replay });
  assert.equal((await api.create(request)).replayed, true);
  await assert.rejects(api.create({ ...request, actorUserId: "other" }), (error) => error.status === 409);
  await assert.rejects(api.create({ ...request, allocations: [{ targetProductCode: "WKB-0064", weightKg: 201 }, request.allocations[1]] }), (error) => error.status === 409);
});

function report(manualRows, extra = {}) {
  return buildProductionInputOutputReport({
    ...mergeManualJamUsageRows({}, manualRows),
    jamRows: mergeManualJamUsageRows({}, manualRows).issueRows,
    pieceRateRows: [
      { actualWeighedAt: "2026-10-14", productCode: "WKB-0064", productName: "A", countValue: 37, normalizedKgAmount: 522.01 },
      { actualWeighedAt: "2026-10-14", productCode: "WKB-0065", productName: "B", countValue: 35, normalizedKgAmount: 534.48 },
    ],
    ...extra,
  });
}
const manual = request.allocations.map((row, index) => ({ id: String(index), usageDate: request.usageDate, goodsCode: request.goodsCode, goodsName: "สับปะรดกวน", lotNo: request.lotNo, targetProductCode: row.targetProductCode, weightKg: row.weightKg }));

test("explicit allocations reach the right outputs and LOTs without BOM redistribution or historical override", () => {
  const result = report([{ ...manual[0], weightKg: 210 }, { ...manual[1], weightKg: 220 }]);
  const rows = result.days[0].rows;
  assert.equal(rows.find((row) => row.fgCode === "WKB-0064").jam.weightKg, 210);
  assert.equal(rows.find((row) => row.fgCode === "WKB-0065").jam.weightKg, 220);
  assert.equal(rows.reduce((sum, row) => sum + (row.jam?.weightKg || 0), 0), 430);
  assert.equal(rows[0].jam.lots[0].lotNo, "261007");
});

test("multiple LOT entries for one output sum once and remain visible after output corrections", () => {
  const result = report([manual[0], { ...manual[0], id: "other", lotNo: "261008", weightKg: 30 }], { pieceRateRows: [] });
  const row = result.days[0].rows.find((row) => row.fgCode === "WKB-0064");
  assert.equal(row.jam.weightKg, 230);
  assert.equal(row.jam.lots.length, 2);
  assert.equal(result.days[0].totals.fgWeightKg, 0);
});


test("cancellation keeps historical weights and targets, records actor, and is safe to retry", async () => {
  const original = { id: "62ef7576-fa2a-4d71-927d-f6d8c6b11533", usage_date: "2026-10-14", goods_code: "M04-0088", lot_no: "261007", weight_kg: 430, status: "confirmed", created_by: "original-actor" };
  let stored = { ...original };
  let writes = 0;
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const db = { from: () => ({
    update(patch) {
      const conditions = [];
      const builder = {
        eq(key, value) { conditions.push([key, value]); return builder; },
        select() { return builder; },
        async maybeSingle() {
          if (!conditions.every(([key, value]) => stored[key] === value)) return { data: null };
          stored = { ...stored, ...patch }; writes += 1; return { data: stored };
        },
      };
      return builder;
    },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored }) }) }),
  }) };
  const context = vm.createContext({ createHash, ApiError, getSupabaseAdmin: () => db });
  vm.runInContext(source + "\nthis.cancel=cancelProductionJamUsage;", context);
  await assert.rejects(context.cancel({ entryId: original.id }), (error) => error.status === 401);
  const first = await context.cancel({ entryId: original.id, actorUserId: "cancel-actor" });
  assert.equal(first.entry.status, "voided");
  assert.equal(stored.voided_by, "cancel-actor");
  assert.ok(stored.voided_at);
  assert.equal(stored.weight_kg, original.weight_kg);
  assert.equal(stored.usage_date, original.usage_date);
  assert.equal(stored.created_by, original.created_by);
  const second = await context.cancel({ entryId: original.id, actorUserId: "cancel-actor" });
  assert.equal(second.alreadyVoided, true);
  assert.equal(writes, 1);
});

test("voided app entries suppress ERP fallback without retaining cancelled quantities", () => {
  const erp = { issueRows: [{ reportDate: "2026-10-14", DI_REF: "X6910/0001", TRD_SH_CODE: "M04-0088", TRD_QTY: 430 }], returnRows: [] };
  const cancelled = [{ ...manual[0], status: "voided" }];
  assert.equal(mergeManualJamUsageRows(erp, cancelled).issueRows.length, 0);
  const partial = mergeManualJamUsageRows(erp, [...cancelled, { ...manual[1], status: "confirmed" }]);
  assert.equal(partial.issueRows.length, 1);
  assert.equal(partial.issueRows[0].TRD_QTY, 230);
});
