import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const modalPath = "src/app/production-line/attendance/piece-rate-scan/PieceRateEmployeeSummaryModal.js";
const workstationPath = "src/app/production-line/attendance/piece-rate-scan/PieceRateDesktopWorkstation.js";

test("PieceRateEmployeeSummaryModal provides a full-screen, collision-safe weight layout", () => {
  assert.equal(existsSync(modalPath), true, "Modal file should exist");
  const source = readFileSync(modalPath, "utf8");

  assert.match(source, /export default function PieceRateEmployeeSummaryModal/);
  assert.match(source, /EmployeePhotoAvatar/);
  assert.match(source, /onPreviewPhoto/);
  assert.match(source, /z-\[200\]/);
  assert.match(source, /100dvh-12px/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /Array\.from\(\{ length: 24 \}/);
  assert.match(source, /grid-cols-12/);
  assert.match(source, /weightSlots\.map/);
  assert.doesNotMatch(source, /slotNo: i \+ 1/);
  assert.match(source, /whitespace-normal break-words/);
  assert.doesNotMatch(source, /leading-tight truncate/);
  assert.match(source, /xl:grid-cols-2/);
});

test("PieceRateDesktopWorkstation integrates full-screen summary modal and live triggers", () => {
  assert.equal(existsSync(workstationPath), true, "Workstation file should exist");
  const source = readFileSync(workstationPath, "utf8");

  assert.match(source, /import PieceRateEmployeeSummaryModal from "\.\/PieceRateEmployeeSummaryModal"/);
  assert.match(source, /isSummaryModalOpen/);
  assert.match(source, /setIsSummaryModalOpen/);
  assert.match(source, /onClick=\{\(\) => setIsSummaryModalOpen\(true\)\}/);
  assert.match(source, /สรุปรายคน \(วันนี้\)/);
  assert.doesNotMatch(source, /เปิดสรุปเต็มจอ/);
  assert.match(source, /<PieceRateEmployeeSummaryModal/);
});
