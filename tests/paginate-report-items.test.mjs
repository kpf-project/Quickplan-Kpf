import assert from "node:assert/strict";
import test from "node:test";

import { paginateReportItems } from "../src/features/attendance/utils/paginateReportItems.js";

test("fills each page from measured row heights", () => {
  const items = ["a", "b", "c", "d", "e"];
  assert.deepEqual(paginateReportItems(items, [30, 30, 50, 20, 20], 100, 0), [
    ["a", "b"],
    ["c", "d", "e"],
  ]);
});

test("moves trailing rows when the final page needs footer space", () => {
  const items = ["a", "b", "c", "d", "e"];
  assert.deepEqual(paginateReportItems(items, [20, 20, 20, 20, 20], 100, 35), [
    ["a", "b", "c", "d"],
    ["e"],
  ]);
});

test("keeps at least one row when a measured row exceeds page height", () => {
  assert.deepEqual(paginateReportItems(["large", "small"], [120, 20], 100, 0), [
    ["large"],
    ["small"],
  ]);
});
