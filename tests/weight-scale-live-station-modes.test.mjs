import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const livePagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLivePageClient.js"
);
const subHeaderPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveSubHeader.js"
);
const voidModalPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveVoidModal.js"
);
const returnSectionPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveReturnSection.js"
);
const issueSectionPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveIssueSection.js"
);
const voidSectionPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleLiveVoidSection.js"
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("live scale station owns a dedicated sub-header with 5 operational modes", () => {
  assert.equal(fs.existsSync(subHeaderPath), true, "sub-header component should exist");
  const subHeaderSource = read(subHeaderPath);

  assert.match(subHeaderSource, /STATION_MODES/);
  assert.match(subHeaderSource, /"inbound"/);
  assert.match(subHeaderSource, /"void"/);
  assert.match(subHeaderSource, /"return"/);
  assert.match(subHeaderSource, /"issue"/);
  assert.match(subHeaderSource, /"cancel_issue"/);
  assert.match(subHeaderSource, /ชั่งเข้า/);
  assert.match(subHeaderSource, /ยกเลิกชั่ง/);
  assert.match(subHeaderSource, /ชั่งคืน/);
  assert.match(subHeaderSource, /สแกนเบิก/);
  assert.match(subHeaderSource, /ยกเลิกเบิก/);
});

test("live scale page mounts the dedicated sub-header and mode sections", () => {
  const source = read(livePagePath);

  assert.match(source, /WeightScaleLiveSubHeader/);
  assert.match(source, /WeightScaleLiveVoidModal/);
  assert.match(source, /WeightScaleLiveReturnSection/);
  assert.match(source, /WeightScaleLiveIssueSection/);
  assert.match(source, /activeStationMode/);
  assert.match(source, /handleConfirmVoidReceipt/);
});

test("void modal contains stock guard blocking cancellation of issued pails", () => {
  assert.equal(fs.existsSync(voidModalPath), true, "void modal component should exist");
  const source = read(voidModalPath);

  assert.match(source, /STOCK INTEGRITY GUARD/);
  assert.match(source, /รายการนี้ถูกเบิกไปใช้งานแล้ว/);
  assert.match(source, /isIssued/);
  assert.match(source, /disabled=\{isProcessing \|\| isIssued\}/);
});

test("live return section validates weight and prevents return exceeding issued weight", () => {
  assert.equal(fs.existsSync(returnSectionPath), true, "return section component should exist");
  const source = read(returnSectionPath);

  assert.match(source, /WeightScaleProductSummary/);
  assert.match(source, /currentReturnWeight > originalIssuedWeight/);
  assert.match(source, /printWeightScaleLabelViaAgent/);
  assert.match(source, /action: "return-source"/);
  assert.match(source, /submitWeightScaleLiveOperation/);
});

test("live issue section enforces child return guard against issue cancellation", () => {
  assert.equal(fs.existsSync(issueSectionPath), true, "issue section component should exist");
  const source = read(issueSectionPath);

  assert.match(source, /WeightScaleConfirmation/);
  assert.match(source, /hasReturn/);
  assert.match(source, /ห้ามยกเลิก: มีใบคืน/);
  assert.match(source, /requestWeightScaleLiveIssue/);
});

test("return and cancellation share the compact workbench without changing stock APIs", () => {
  const returns = read(returnSectionPath);
  const voids = read(voidSectionPath);
  const shared = read(path.join(repoRoot, "src/features/production-line/components/WeightScaleWorkbench.js"));
  for (const source of [returns, voids]) {
    assert.match(source, /WeightScaleWorkbench.module.css/);
    assert.match(source, /WeightScaleProductSummary/);
    assert.match(source, /max=\{todayIso\}/);
  }
  assert.match(returns, /returnDate: returnDate \|\| todayIso/);
  assert.match(returns, /!returnDate \|\| returnDate > todayIso/);
  assert.match(voids, /dateFrom: receiptDate/);
  assert.match(voids, /setConfirmOpen\(true\)/);
  assert.match(voids, /matchedReceipt.isIssued \|\| matchedReceipt.status === "voided" \|\| isVoiding \|\| !voidReason.trim\(\)/);
  assert.match(shared, /dialog.showModal\(\)/);
  assert.match(shared, /onCancel/);
  assert.match(shared, /autoFocus/);
});

test("live scale recent receipts table renders inline void action alongside reprint", () => {
  const source = read(livePagePath);

  assert.match(source, /พิมพ์ซ้ำ/);
  assert.match(source, /setIsVoidModalOpen\(true\)/);
  assert.match(source, /ยกเลิกแล้ว/);
});

test("live issue section equips instant scan-to-save and anti-double-scan queue", () => {
  const source = read(issueSectionPath);

  assert.match(source, /createBarcodeScanQueue/);
  assert.match(source, /cooldownMs:\s*3000/);
  assert.match(source, /instantMode/);
  assert.match(source, /สแกนแล้วเบิกทันที/);
  assert.match(source, /ป้องกันสแกนซ้ำ/);
  assert.match(source, /WeightScaleHistoryTable/);
});

test("live void section provides scan-to-void input and enforces stock integrity guard", () => {
  assert.equal(fs.existsSync(voidSectionPath), true, "void section component should exist");
  const source = read(voidSectionPath);

  assert.match(source, /WeightScaleConfirmation/);
  assert.match(source, /สแกนบาร์โค้ดใบชั่ง หรือพิมพ์เลข/);
  assert.match(source, /action: "void-source"/);
  assert.match(source, /submitWeightScaleLiveOperation/);
  assert.match(source, /isIssued/);
  assert.match(source, /matchedReceipt\.isIssued/);
  assert.match(source, /บล็อกถังที่ถูกเบิกแล้ว/);
});

test("return section and issue section support backdated business date selection", () => {
  const returnSource = read(returnSectionPath);
  const issueSource = read(issueSectionPath);

  assert.match(returnSource, /returnDate/);
  assert.match(returnSource, /Business Date/);
  assert.match(returnSource, /ชั่งคืนย้อนหลัง/);

  assert.match(issueSource, /วันที่เบิก/);
  assert.match(issueSource, /max=\{today\(\)\}/);
});

test("sections equip dedicated today history tables, department scoping, and pagination", () => {
  const paginationBarPath = path.join(
    repoRoot,
    "src/features/production-line/components/WeightScalePaginationBar.js"
  );
  assert.equal(fs.existsSync(paginationBarPath), true, "pagination bar component must exist");
  const paginationSource = read(paginationBarPath);
  assert.match(paginationSource, /WeightScalePaginationBar/);
  assert.match(paginationSource, /แสดงหน้าละ:/);
  assert.match(paginationSource, /จากทั้งหมด/);

  const returnSource = read(returnSectionPath);
  assert.match(returnSource, /WeightScalePaginationBar/);
  assert.match(returnSource, /รายการคืนตามวันที่เลือก/);
  assert.match(returnSource, /loadTodayReturns/);
  assert.match(returnSource, /if \(!hasContext\) return/);
  assert.match(returnSource, /historyTotalCount/);

  const voidSource = read(voidSectionPath);
  assert.match(voidSource, /WeightScalePaginationBar/);
  assert.match(voidSource, /ประวัติรายการชั่ง/);
  assert.match(voidSource, /loadTodayReceipts/);
  assert.match(voidSource, /if \(!hasContext\) return/);
  assert.match(voidSource, /historyTotalCount/);

  const issueSource = read(issueSectionPath);
  assert.match(issueSource, /WeightScalePaginationBar/);
  assert.match(issueSource, /รายการเบิกตามวันที่เลือก/);
  assert.match(issueSource, /loadHistory/);
  assert.match(issueSource, /departmentId, workstationId/);
});



