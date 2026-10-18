import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("packing desktop keeps all three steps in one row with a narrow-screen stack", () => {
  const css = readFileSync("src/app/production-line/attendance/packing-output/PackingWorkspace.module.css", "utf8");
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,\.9fr\) minmax\(0,1\.1fr\)/);
  assert.match(css, /\.productStrip \{ grid-column:auto;/);
  assert.match(css, /@media\(max-width:900px\) \{ \.workspace \{ grid-template-columns:1fr;/);
  assert.match(css, /object-fit:contain/);
});

test("packing entry uses three steps and the shared daily history without changing its write endpoint", () => {
  const source = readFileSync("src/app/production-line/attendance/packing-output/NonWagePackingOutputPageClient.js", "utf8");
  assert.match(source, /PackingHistoryTable/);
  assert.match(source, /dateFrom: workDate, dateTo: workDate/);
  assert.doesNotMatch(source, /setDateFrom|setDateTo|summaryPanel/);
  assert.equal((source.match(/<h2><span>[123]<\/span>/g) || []).length, 3);
  assert.match(source, /const API = "\/api\/attendance\/non-wage-packing-output"/);
});

import {
  calculatePackingOutput,
  lotFromWorkDate,
  normalizeCarryoverLots,
} from "../src/lib/nonWagePackingOutput.js";

test("converts cartons to packs and sachets", () => {
  assert.deepEqual(
    calculatePackingOutput({ cartons: 200, packsPerCarton: 24, sachetsPerPack: 18 }),
    { cartons: 200, packs: 4800, sachets: 86400 }
  );
  assert.equal(lotFromWorkDate("2026-09-30"), "300926");
});

test("keeps different carryover lots separate and merges duplicate lots", () => {
  assert.deepEqual(normalizeCarryoverLots([
    { lotNo: "290926", packs: 3, sachets: 0 },
    { lotNo: "280926", packs: 0, sachets: 5 },
    { lotNo: "290926", packs: 1, sachets: 4 },
  ]), [
    { lotNo: "290926", packs: 4, sachets: 4 },
    { lotNo: "280926", packs: 0, sachets: 5 },
  ]);
});

test("packing output is opened from the jam-label workflow menu", () => {
  const workflow = readFileSync(
    "src/features/attendance/components/PieceRateWorkflowTabs.js",
    "utf8"
  );
  assert.match(workflow, /href: "\/production-line\/attendance\/packing-output"/);
  assert.match(workflow, /label: "บันทึกผลผลิตไม่คิดค่าแรง"/);
});
