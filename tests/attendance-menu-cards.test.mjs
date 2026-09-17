import assert from "node:assert/strict";
import test from "node:test";

import { buildAttendanceMenuCards } from "../src/lib/attendance-menu-cards.js";

test("attendance menu replaces retired entry cards without exposing their routes", () => {
  const cards = buildAttendanceMenuCards({
    loaded: true,
    permissions: ["production-line-attendance-view"],
  });

  assert.deepEqual(cards.map((card) => card.href), [
    "/production-line/attendance/scan",
    "/production-line/fg-wip",
    "/production-line/weight-scale",
    "/production-line/attendance/piece-rate-scan",
  ]);
  assert.deepEqual(cards.map((card) => card.title), [
    "ลงเวลาเข้า-ออก",
    "บันทึกผลผลิตและ WIP",
    "ชั่งน้ำหนักผลิตภัณฑ์",
    "สแกนคิดค่าแรง",
  ]);
  assert.equal(cards.some((card) => card.href.includes("snack-yield-scan")), false);
  assert.equal(cards.some((card) => card.href.includes("pallet-scan")), false);
});

test("report-only user does not see FG/WIP card they cannot open", () => {
  const cards = buildAttendanceMenuCards({
    loaded: true,
    permissions: ["production-line-attendance-report-view"],
  });

  assert.deepEqual(cards.map((card) => card.href), [
    "/production-line/attendance/scan",
    "/production-line/weight-scale",
    "/production-line/attendance/piece-rate-scan",
  ]);
});

test("admin sees every current attendance menu card", () => {
  const cards = buildAttendanceMenuCards({ loaded: true, isAdmin: true });
  assert.equal(cards.length, 4);
});

test("menu stays empty until permissions have loaded", () => {
  assert.deepEqual(buildAttendanceMenuCards({ loaded: false }), []);
});
