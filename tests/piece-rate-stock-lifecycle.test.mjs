import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toBangkokDateKey } from "../src/lib/bangkokDate.js";
import { rowsToCsv } from "../src/lib/csvResponse.js";
import test from "node:test";

test("piece-rate stock lifecycle has issue and return documents", () => {
  const migration = readFileSync(
    "supabase/migrations/20260804071019_add_piece_rate_stock_lifecycle.sql",
    "utf8"
  );

  assert.match(migration, /create table if not exists public\.production_piece_rate_stock_issues/i);
  assert.match(migration, /piece_rate_log_id uuid not null references public\.production_piece_rate_logs/i);
  assert.match(migration, /production_piece_rate_stock_issues_active_log_uidx/i);
  assert.match(migration, /create table if not exists public\.production_piece_rate_stock_returns/i);
});

test("piece-rate stock operations are atomic and post immutable ledger movements", () => {
  const migration = readFileSync(
    "supabase/migrations/20260804095721_complete_piece_rate_stock_ledger.sql",
    "utf8"
  );
  const service = readFileSync(
    "src/features/attendance/services/pieceRateStockService.js",
    "utf8"
  );

  assert.match(migration, /create_piece_rate_stock_issue_atomic/);
  assert.match(migration, /create_piece_rate_stock_return_atomic/);
  assert.match(migration, /cancel_piece_rate_stock_issue_atomic/);
  assert.match(migration, /cancel_piece_rate_weigh_atomic/);
  assert.match(migration, /for update/i);
  assert.match(migration, /'piece_rate_weigh'/);
  assert.match(migration, /'piece_rate_issue'/);
  assert.match(migration, /'piece_rate_return'/);
  assert.match(migration, /'piece_rate_weigh_void'/);
  assert.match(migration, /'piece_rate_issue_void'/);
  assert.match(migration, /production_stock_movements_piece_rate_source_uidx/);
  assert.match(migration, /resolve_piece_rate_stock_department/);
  assert.match(service, /rpc\("create_piece_rate_stock_issue_atomic"/);
  assert.match(service, /rpc\("create_piece_rate_stock_issue_batch_atomic"/);
  assert.match(service, /rpc\("create_piece_rate_stock_return_atomic"/);
  assert.match(service, /rpc\("cancel_piece_rate_stock_issue_atomic"/);
  assert.match(service, /rpc\("cancel_piece_rate_weigh_atomic"/);
});

test("piece-rate batch issue uses one database RPC for up to 50 labels", () => {
  const migration = readFileSync(
    "supabase/migrations/20260810032000_add_bulk_piece_rate_stock_issue.sql",
    "utf8"
  );
  const service = readFileSync(
    "src/features/attendance/services/pieceRateStockService.js",
    "utf8"
  );
  const batchStart = service.indexOf("export async function createPieceRateStockIssueBatch");
  const batchEnd = service.indexOf("export async function createPieceRateStockReturn", batchStart);
  const batchSource = service.slice(batchStart, batchEnd);

  assert.match(migration, /create_piece_rate_stock_issue_batch_atomic/);
  assert.match(migration, /v_total > 50/);
  assert.match(migration, /create_piece_rate_stock_issue_atomic/);
  assert.match(batchSource, /create_piece_rate_stock_issue_batch_atomic/);
  assert.doesNotMatch(batchSource, /Promise\.all/);
});

test("piece-rate returns create re-issuable X-sequence labels on the selected business date", () => {
  const migration = readFileSync(
    "supabase/migrations/20260810020147_add_piece_rate_return_labels_and_business_date.sql",
    "utf8"
  );
  const service = readFileSync(
    "src/features/attendance/services/pieceRateStockService.js",
    "utf8"
  );
  const workflow = readFileSync(
    "src/features/attendance/components/PieceRateStockWorkflowPageClient.js",
    "utf8"
  );

  assert.match(migration, /v_source_barcode \|\| 'X' \|\| lpad\(v_sequence::text, 2, '0'\)/);
  assert.match(migration, /return_barcode text/);
  assert.match(migration, /source_return_id uuid/);
  assert.match(migration, /v_business_date, v_effective_at/);
  assert.match(migration, /'labelBarcode', v_return_barcode/);
  assert.match(service, /p_return_date: returnDate/);
  assert.match(service, /\.eq\("return_barcode", normalized\)/);
  assert.match(workflow, /type="date"/);
  assert.match(workflow, /printPieceRateLabelViaAgent\(buildPieceRateDesktopLabel/);
  assert.match(workflow, /เปิดรายการที่ยังไม่เคยเบิก/);
  assert.match(workflow, /role="dialog" aria-modal="true"/);
  assert.match(workflow, /fetchAvailablePieceRateStockLabels/);
  assert.match(workflow, /type="checkbox"/);
  assert.match(workflow, /submitPieceRateStockIssueBatch/);
  assert.match(workflow, /labelDateFilter/);
  assert.match(workflow, /selectedProductCodes/);
  assert.match(workflow, /สินค้าทั้งหมด/);
  assert.match(service, /fetchAllSupabaseRows/);
  assert.doesNotMatch(service, /\.limit\(600\)/);
  assert.match(workflow, /LABEL_PAGE_SIZE = 50/);
  assert.match(workflow, /useState\(getBangkokDate\)/);
  assert.match(workflow, /setLabelDateFilter\(getBangkokDate\(\)\)/);
});

test("piece-rate issue records and reports use the operator-selected business date", () => {
  const migration = readFileSync(
    "supabase/migrations/20260817090724_add_piece_rate_issue_business_date.sql",
    "utf8"
  );
  const service = readFileSync(
    "src/features/attendance/services/pieceRateStockService.js",
    "utf8"
  );
  const workflow = readFileSync(
    "src/features/attendance/components/PieceRateStockWorkflowPageClient.js",
    "utf8"
  );

  assert.match(migration, /add column if not exists issue_date date/);
  assert.match(migration, /v_issue_date date := coalesce\(p_issue_date/);
  assert.match(migration, /v_issue_date, v_now, v_department\.department_id/);
  assert.match(service, /p_issue_date: issueDate/);
  assert.match(service, /normalizeBusinessDate\(body\.issueDate \|\| body\.businessDate, "วันที่เบิก"\)/);
  assert.match(workflow, /const \[issueDate, setIssueDate\] = useState\(getBangkokDate\)/);
  assert.match(workflow, /<span>วันที่เบิก<\/span>/);
  assert.ok((workflow.match(/issueDate,/g) || []).length >= 3);
});

test("piece-rate label date filters use the Bangkok calendar date", () => {
  assert.equal(toBangkokDateKey("2026-08-09T18:30:00.000Z"), "2026-08-10");
  assert.equal(toBangkokDateKey("2026-08-10"), "2026-08-10");
});

test("piece-rate stock API exposes lookup, issue, return, cancellation and report routes", () => {
  const lookupRoute = readFileSync("src/app/api/attendance/piece-rate/stock/route.js", "utf8");
  const returnRoute = readFileSync("src/app/api/attendance/piece-rate/stock/return/route.js", "utf8");
  const cancelRoute = readFileSync("src/app/api/attendance/piece-rate/stock/cancel/route.js", "utf8");
  const cancelWeighRoute = readFileSync("src/app/api/attendance/piece-rate/stock/cancel-weigh/route.js", "utf8");
  const movementsRoute = readFileSync("src/app/api/attendance/piece-rate/stock/movements/route.js", "utf8");

  assert.match(lookupRoute, /lookupPieceRateStockDocument/);
  assert.match(lookupRoute, /createPieceRateStockIssue/);
  assert.match(returnRoute, /createPieceRateStockReturn/);
  assert.match(cancelRoute, /cancelPieceRateStockIssue/);
  assert.match(cancelWeighRoute, /cancelPieceRateWeigh/);
  assert.match(movementsRoute, /production_stock_movements/);
  assert.match(movementsRoute, /piece_rate_weigh_void/);
  assert.match(movementsRoute, /REPORT_TYPES/);
  assert.match(movementsRoute, /buildAggregateMovementReportRows/);
  assert.match(movementsRoute, /buildBalanceRows/);
  assert.match(movementsRoute, /format === "csv"/);
  assert.doesNotMatch(movementsRoute, /production_piece_rate_waste_logs/);
});

test("piece-rate Excel CSV preserves commas, quotes and Thai text", () => {
  const csv = rowsToCsv(
    [{ key: "name", header: "ชื่อสินค้า" }, { key: "quantity", header: "จำนวน" }],
    [{ name: 'สินค้า, ขนาด "ใหญ่"', quantity: 12.5 }]
  );

  assert.equal(
    csv,
    '\uFEFFชื่อสินค้า,จำนวน\r\n"สินค้า, ขนาด ""ใหญ่""",12.5'
  );
});

test("piece-rate Excel CSV neutralizes spreadsheet formulas", () => {
  const csv = rowsToCsv(
    [{ key: "name", header: "ชื่อสินค้า" }, { key: "quantity", header: "จำนวน" }],
    [{ name: "=HYPERLINK(\"https://example.test\")", quantity: -2.5 }]
  );

  assert.equal(csv, '\uFEFFชื่อสินค้า,จำนวน\r\n"\'=HYPERLINK(""https://example.test"")",-2.5');
});

test("piece-rate scan exposes compact stock workflow, reports and desktop scanner guard", () => {
  const component = readFileSync(
    "src/features/attendance/components/PieceRateStockWorkflowPageClient.js",
    "utf8"
  );
  const navigation = readFileSync("src/components/appNavigation.js", "utf8");
  const workflowTabs = readFileSync(
    "src/features/attendance/components/PieceRateWorkflowTabs.js",
    "utf8"
  );
  const scanPage = readFileSync(
    "src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js",
    "utf8"
  );
  const movementReport = readFileSync(
    "src/features/attendance/components/PieceRateStockMovementReportPageClient.js",
    "utf8"
  );
  const reportPage = readFileSync(
    "src/app/production-line/attendance/report/piece-rate-stock/page.js",
    "utf8"
  );

  assert.match(component, /submitPieceRateStockIssue/);
  assert.match(component, /submitPieceRateStockReturn/);
  assert.match(component, /usePieceRateDesktopScale/);
  assert.match(component, /scale\.isStable/);
  assert.match(component, /createBarcodeScanQueue\(\{ cooldownMs: 2500 \}\)/);
  assert.match(component, /mode === "issue"[\s\S]*submitPieceRateStockIssue/);
  assert.match(component, /autoReturnDocRef/);
  assert.doesNotMatch(component, /cancelReason: reason/);
  assert.match(workflowTabs, /mode: "weigh-in"/);
  assert.match(workflowTabs, /mode: "issue"/);
  assert.match(workflowTabs, /mode: "return"/);
  assert.match(workflowTabs, /mode: "cancel-issue"/);
  assert.match(workflowTabs, /mode: "cancel-weigh"/);
  assert.match(workflowTabs, /label: "รายงาน"/);
  assert.match(workflowTabs, /report\/piece-rate-stock\?report=inbound/);
  assert.match(workflowTabs, /report\/piece-rate-stock\?report=issue/);
  assert.match(workflowTabs, /report\/piece-rate-stock\?report=movement/);
  assert.match(workflowTabs, /report\/piece-rate-stock\?report=balance/);
  assert.match(workflowTabs, /report\/piece-rate-stock\?report=prison/);
  assert.match(scanPage, /desktopWorkflowMode/);
  assert.match(scanPage, /isDesktopPieceRateRuntime\(\)\) return undefined/);
  assert.match(scanPage, /PieceRateStockWorkflowPageClient/);
  assert.match(navigation, /piece-rate-scan/);
  assert.match(movementReport, /รายงานรับเข้า/);
  assert.match(movementReport, /รายงานเบิก/);
  assert.match(movementReport, /รายงานเคลื่อนไหว/);
  assert.match(movementReport, /รายงานคงเหลือ/);
  assert.match(movementReport, /สินค้า FG \(04 \/ 04-1 \/ 04-2\)/);
  assert.match(movementReport, /คงเหลือแยก LOT/);
  assert.match(movementReport, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(movementReport, /MOVEMENT_GROUPS/);
  assert.match(movementReport, /ยกยอด/);
  assert.match(movementReport, /ใช้จริง/);
  assert.match(movementReport, /row\.id \|\|/);
  assert.match(reportPage, /รายงานสต็อกป้ายแยม/);
  assert.doesNotMatch(`${workflowTabs}\n${movementReport}\n${reportPage}`, /(?:\u00e0\u00b8|\u00e0\u00b9|\uFFFD)/);
});
