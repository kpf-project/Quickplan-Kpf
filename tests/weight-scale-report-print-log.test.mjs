import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeightScaleReportPrintLog,
  printReportWithBestEffortAudit,
  validateWeightScaleReportPrintLog,
} from "../src/lib/weight-scale-report-print-log.js";

test("print log records the requested and actually displayed sequence range", () => {
  const payload = buildWeightScaleReportPrintLog({
    requestId: "a7298803-6e13-4f2e-a0ef-d70bc22d88b8",
    filters: {
      dateFrom: "2026-09-07",
      dateTo: "2026-09-07",
      itemStatus: "available",
      itemStart: 10,
      itemEnd: 20,
      productCodes: ["WKB-0053"],
      recordType: "production",
      search: "2408260053-1",
      lotNo: "2408260053-1",
      isTest: "false",
    },
    receipts: [
      { id: "8b76e655-b452-4c02-8832-ad9a2dd84aa8", barcode: "24082600530010", originalSequence: 10 },
      { id: "a4c3b350-43f9-4f84-90c4-353f70ec0089", barcode: "24082600530020", originalSequence: 20 },
    ],
  });

  assert.deepEqual(payload, {
    requestId: "a7298803-6e13-4f2e-a0ef-d70bc22d88b8",
    dateFrom: "2026-09-07",
    dateTo: "2026-09-07",
    itemStatus: "available",
    requestedStart: 10,
    requestedEnd: 20,
    displayedStart: 10,
    displayedEnd: 20,
    displayedCount: 2,
    firstReceiptId: "8b76e655-b452-4c02-8832-ad9a2dd84aa8",
    lastReceiptId: "a4c3b350-43f9-4f84-90c4-353f70ec0089",
    firstBarcode: "24082600530010",
    lastBarcode: "24082600530020",
    productCodes: ["WKB-0053"],
    recordType: "production",
    search: "2408260053-1",
    lotNo: "2408260053-1",
    isTest: "false",
  });
});

test("printing does not wait for audit logging and repeated clicks create separate attempts", () => {
  const events = [];
  let resolveFirstAudit;
  const firstAudit = new Promise((resolve) => {
    resolveFirstAudit = resolve;
  });
  const logAudit = (payload) => {
    events.push(`audit:${payload.requestId}`);
    return payload.requestId === "first" ? firstAudit : Promise.resolve();
  };
  const print = () => events.push("print");

  printReportWithBestEffortAudit({ auditPayload: { requestId: "first" }, logAudit, print });
  printReportWithBestEffortAudit({ auditPayload: { requestId: "second" }, logAudit, print });

  assert.deepEqual(events, ["audit:first", "print", "audit:second", "print"]);
  resolveFirstAudit();
});

test("audit logging failure never blocks the browser print dialog", async () => {
  const events = [];

  printReportWithBestEffortAudit({
    auditPayload: { requestId: "failed" },
    logAudit: () => Promise.reject(new Error("offline")),
    print: () => events.push("print"),
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["print"]);
});

test("server validation rejects malformed or inverted print ranges", () => {
  assert.throws(
    () => validateWeightScaleReportPrintLog({ requestId: "not-a-uuid" }),
    /requestId/
  );

  assert.throws(
    () =>
      validateWeightScaleReportPrintLog({
        requestId: "a7298803-6e13-4f2e-a0ef-d70bc22d88b8",
        dateFrom: "2026-09-07",
        dateTo: "2026-09-07",
        itemStatus: "available",
        requestedStart: 20,
        requestedEnd: 10,
        displayedCount: 0,
      }),
    /requestedEnd/
  );
});

test("print audit accepts the combined production and return report", () => {
  const payload = validateWeightScaleReportPrintLog({
    requestId: "a7298803-6e13-4f2e-a0ef-d70bc22d88b8",
    dateFrom: "2026-09-09",
    dateTo: "2026-09-09",
    itemStatus: "available",
    recordType: "all",
    displayedCount: 0,
  });

  assert.equal(payload.recordType, "all");
});
