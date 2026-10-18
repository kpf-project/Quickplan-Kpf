import assert from "node:assert/strict";
import test from "node:test";

import {
  alignPieceRateMetadataToWorkDate,
  getBangkokWorkDate,
  resolvePieceRateWorkTimestamp,
  validatePieceRateWorkDate,
} from "../src/lib/piece-rate-work-date.js";

const NOW = new Date("2026-09-29T23:45:12.345+07:00");

test("piece-rate work date defaults to the current Bangkok calendar date", () => {
  assert.equal(getBangkokWorkDate(NOW), "2026-09-29");
});

test("piece-rate work date accepts today and past dates but rejects future and invalid dates", () => {
  assert.equal(validatePieceRateWorkDate("2026-09-29", NOW), "2026-09-29");
  assert.equal(validatePieceRateWorkDate("2026-09-17", NOW), "2026-09-17");
  assert.throws(() => validatePieceRateWorkDate("2026-09-30", NOW), /อนาคต/);
  assert.throws(() => validatePieceRateWorkDate("2026-02-30", NOW), /ไม่ถูกต้อง/);
});

test("selected historical work date keeps the real Bangkok capture time without changing its report date", () => {
  assert.equal(
    resolvePieceRateWorkTimestamp({ workDate: "2026-09-17", capturedAt: NOW, now: NOW }),
    "2026-09-17T16:45:12.345Z"
  );
});

test("piece-rate timestamp rejects a selected date later than Bangkok today", () => {
  assert.throws(
    () => resolvePieceRateWorkTimestamp({
      workDate: "2026-09-30",
      capturedAt: NOW,
      now: NOW,
    }),
    /อนาคต/
  );
});

test("piece-rate metadata uses the work date and preserves the physical capture time", () => {
  const metadata = alignPieceRateMetadataToWorkDate({
    scaleAudit: { capturedAt: "2026-09-29T01:45:17.187Z", connected: true },
  }, "2026-09-28T01:45:17.187Z");

  assert.deepEqual(metadata.scaleAudit, {
    capturedAt: "2026-09-28T01:45:17.187Z",
    physicalCapturedAt: "2026-09-29T01:45:17.187Z",
    connected: true,
  });
});
