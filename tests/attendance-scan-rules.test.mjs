import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttendanceEmployeeVariants,
  formatBangkokAttendanceTime,
  getAttendanceDayState,
  getAttendanceEmployeeKey,
  getBangkokAttendanceDay,
} from "../src/features/attendance/services/attendanceScanRules.js";

test("attendance employee aliases share one canonical five-digit key", () => {
  assert.equal(getAttendanceEmployeeKey("KPF-123"), "00123");
  assert.equal(getAttendanceEmployeeKey("kpf00123"), "00123");
  assert.equal(getAttendanceEmployeeKey("00123"), "00123");

  const variants = buildAttendanceEmployeeVariants("KPF-123");
  assert.deepEqual(
    new Set(variants),
    new Set(["KPF-123", "00123", "KPF-00123", "KPF00123"])
  );
});

test("attendance business day uses Bangkok instead of the UTC date before 07:00", () => {
  const day = getBangkokAttendanceDay(new Date("2026-07-15T18:30:00.000Z"));

  assert.deepEqual(day, {
    dateKey: "2026-07-16",
    startIso: "2026-07-15T17:00:00.000Z",
    endIso: "2026-07-16T17:00:00.000Z",
  });
});

test("attendance day state counts only accepted QR events for the same employee", () => {
  const rows = [
    {
      id: "in-ok",
      employee_code: "KPF-00123",
      raw_qr_payload: "KPF-00123",
      event_type: "IN",
      status: "accepted",
      scanned_at: "2026-07-15T23:00:00.000Z",
    },
    {
      id: "out-rejected",
      employee_code: "00123",
      raw_qr_payload: "00123",
      event_type: "OUT",
      status: "rejected",
      scanned_at: "2026-07-16T08:00:00.000Z",
    },
    {
      id: "other-employee",
      employee_code: "KPF-00999",
      raw_qr_payload: "KPF-00999",
      event_type: "OUT",
      status: "accepted",
      scanned_at: "2026-07-16T09:00:00.000Z",
    },
  ];

  const state = getAttendanceDayState(rows, "KPF123");
  assert.equal(state.inEvent?.id, "in-ok");
  assert.equal(state.outEvent, null);
});

test("attendance QR snapshot time is formatted in Bangkok", () => {
  assert.equal(
    formatBangkokAttendanceTime("2026-07-15T18:30:45.000Z"),
    "01:30:45"
  );
  assert.equal(formatBangkokAttendanceTime("invalid"), null);
});
