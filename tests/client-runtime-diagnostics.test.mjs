import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientDiagnostic,
  createIncidentId,
  sanitizeDiagnosticText,
} from "../src/lib/clientDiagnosticsShared.js";
import {
  enqueueClientDiagnostic,
  flushClientDiagnosticQueue,
  readClientDiagnosticQueue,
} from "../src/lib/clientDiagnosticsQueue.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("creates a support-friendly incident id", () => {
  const incidentId = createIncidentId({
    now: new Date("2026-07-14T07:39:12.000Z"),
    randomValue: "ABC123",
  });

  assert.equal(incidentId, "WEB-20260714-073912-ABC123");
});

test("removes credentials and query values from diagnostic text", () => {
  const text = sanitizeDiagnosticText(
    "GET https://production.kpfoods.co.th/api/test?token=secret&employee=1001 Authorization: Bearer abc.def.ghi cookie: kpf-session=private",
  );

  assert.doesNotMatch(text, /secret|1001|abc\.def\.ghi|private/);
  assert.match(text, /https:\/\/production\.kpfoods\.co\.th\/api\/test\?\[REDACTED_QUERY\]/);
  assert.match(text, /Authorization: \[REDACTED\]/i);
  assert.match(text, /cookie: \[REDACTED\]/i);
});

test("normalizes diagnostics without retaining URL search or hash", () => {
  const diagnostic = buildClientDiagnostic({
    incidentId: "WEB-20260714-073912-ABC123",
    eventType: "next-error-boundary",
    message: "Render failed",
    stack: "Error: Render failed\n at Component (?employee=1001)",
    digest: "1947912836",
    pathname: "/production-line/attendance/piece-rate-scan?employee=1001#form",
    deploymentId: "release-123",
    deviceId: "device-123",
    occurredAt: "2026-07-14T07:39:12.000Z",
    metadata: {
      online: true,
      effectiveType: "4g",
      ignoredSecret: "must-not-survive",
    },
  });

  assert.equal(diagnostic.pathname, "/production-line/attendance/piece-rate-scan");
  assert.equal(diagnostic.metadata.online, true);
  assert.equal(diagnostic.metadata.effectiveType, "4g");
  assert.equal("ignoredSecret" in diagnostic.metadata, false);
  assert.doesNotMatch(diagnostic.stack, /1001/);
});

test("keeps a bounded persistent queue and records the first delivery failure", async () => {
  const storage = createMemoryStorage();
  const diagnostic = buildClientDiagnostic({
    incidentId: "WEB-20260714-073912-ABC123",
    eventType: "window-error",
    message: "Failed to fetch",
    pathname: "/production-line/attendance/piece-rate-scan",
    occurredAt: "2026-07-14T07:39:12.000Z",
  });

  enqueueClientDiagnostic(storage, diagnostic);
  await flushClientDiagnosticQueue(storage, async () => {
    throw new TypeError("Failed to fetch");
  }, { now: () => "2026-07-14T07:39:13.000Z" });

  const queuedAfterFailure = readClientDiagnosticQueue(storage);
  assert.equal(queuedAfterFailure.length, 1);
  assert.deepEqual(queuedAfterFailure[0].metadata.firstDeliveryFailure, {
    at: "2026-07-14T07:39:13.000Z",
    reason: "network-error",
  });

  let delivered = null;
  await flushClientDiagnosticQueue(storage, async (payload) => {
    delivered = payload;
    return { ok: true, status: 202 };
  });

  assert.equal(readClientDiagnosticQueue(storage).length, 0);
  assert.equal(delivered.metadata.firstDeliveryFailure.reason, "network-error");
});

