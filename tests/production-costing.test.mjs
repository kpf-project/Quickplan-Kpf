import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Cost estimate uses central report and vector-first paged printing without text clipping", () => {
  const source = readFileSync("src/features/production-costing/components/MaterialCostEstimateReport.js", "utf8");
  const css = readFileSync("src/features/production-costing/components/CostReport.module.css", "utf8");
  const center = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");
  assert.match(source, /ReportDocument/);
  assert.match(source, /ReportPageHeader/);
  assert.match(source, /ReportTable/);
  assert.match(source, /exportReportExcel/);
  assert.match(source, /paginateReportItems/);
  assert.match(source, /A4_PORTRAIT_SPEC/);
  assert.match(source, /document\.fonts\.ready/);
  assert.match(source, /window\.print\(\)/);
  assert.match(center, /selected\?\.id === "cost-estimate" \? <MaterialCostEstimateClient/);
  assert.doesNotMatch(source + css, /html2canvas|line-clamp|text-overflow:\s*ellipsis|\btruncate\b/);
  const widths = [...source.matchAll(/width: "(\d+)%"/g)].map((match) => Number(match[1]));
  assert.equal(widths.reduce((sum, value) => sum + value, 0), 100);
});
import {
  buildScopedSnapshotMaterials,
  attachOutputsToPlanRows,
  extractBomSnapshotMaterials,
  planMatchesRequisitionWorkstream,
  parseLotToDates,
  parseCostingLotDate,
  productionReceiptDateRange,
  resolveCostTreeUsage,
  parseProductionLotDate,
  allocateJointProductWeights,
  calculateBakingYield,
  calculateCostSheetTotals,
  validateCostSheetClose,
  validateCentralAllocation,
  buildProductionOutputCandidates,
  applyMaterialIssueCostToReceipts,
  rawMaterialUnitCostExclVat,
  prefersActualWipIssueAllocation,
  resolveFlourSiftingProfile,
  resolveUpstreamCostSku,
  buildMaterialEstimateRows,
  resolveBiscuitSandwichRatio,
  allocateBiscuitSandwichShellAndJam,
  summarizePieceRateLabor,
  buildInputOutputJamCostRows,
} from "../src/lib/productionCostingMath.js";

test("jam costing keeps the selected output's Input/Output LOT quantities without allocating the day again", () => {
  const rows = [
    { fgCode: "WKB-0002-1", jam: { code: "M04-0088", name: "สับปะรดกวน", issueRefs: ["APP-A", "APP-B"], lots: [
      { lotNo: "260924", weightKg: 140.36 }, { lotNo: "260928", weightKg: 156.55 },
    ] } },
    { fgCode: "WKB-0065", jam: { code: "M04-0088", lots: [{ lotNo: "260924", weightKg: 119.64 }, { lotNo: "260928", weightKg: 133.45 }] } },
    { fgCode: "WKB-0066", jam: { code: "PJST3", lots: [{ lotNo: "261007", weightKg: 140 }] } },
    { fgCode: "B06-0005", jam: null },
  ];
  const items = buildInputOutputJamCostRows(rows, ["WKB-0002-1"]);
  assert.deepEqual(items.map((item) => [item.lotNo, item.qty]), [["260924", 140.36], ["260928", 156.55]]);
  assert.equal(Number(items.reduce((sum, item) => sum + item.qty, 0).toFixed(2)), 296.91);
  assert.equal(items[0].source, "APP-A, APP-B");
  assert.ok(items.every((item) => item.status === "missing_cost"));
  assert.deepEqual(buildInputOutputJamCostRows(rows, ["B06-0005"]), []);
});

test("direct labor uses stored piece-rate wages for the exact product and LOT", () => {
  const summary = summarizePieceRateLabor([
    { doc_no: "A", employee_code: "E1", lot_no: "0910260001-1", product_sku_code_snapshot: "WKB-0002-1", wage_amount_snapshot: 414, doc_status: "active" },
    { doc_no: "B", employee_code: "E2", lot_no: "0910260001-1", product_code_snapshot: "WKB-0002-1", wage_amount_snapshot: 558, doc_status: "active" },
    { doc_no: "C", employee_code: "E3", lot_no: "0910260001-1", product_goods_code_snapshot: "WKB-0002-1", wage_amount_snapshot: 1431, doc_status: "active" },
    { doc_no: "VOID", employee_code: "E4", lot_no: "0910260001-1", product_sku_code_snapshot: "WKB-0002-1", wage_amount_snapshot: 999, doc_status: "cancelled" },
    { doc_no: "OTHER", employee_code: "E5", lot_no: "0910260002-1", product_sku_code_snapshot: "WKB-0002-1", wage_amount_snapshot: 999, doc_status: "active" },
  ], { aliases: ["WKB-0002-1"], lotNo: "0910260001-1" });

  assert.deepEqual(summary, { amount: 2403, documentCount: 3, employeeCount: 3 });
});

test("material estimate uses the latest receipt price excluding VAT and converts it to the BOM trade unit", () => {
  const rows = buildMaterialEstimateRows({
    estimateDate: "2026-09-28",
    explosionRows: [
      { itemType: "RAW", materialSkuCode: "M04-0079", materialGoodsCode: "M04-00790", materialName: "MARGARINE", requiredQty: 12, uomName: "กล่องx15" },
      { itemType: "RAW", materialSkuCode: "M01-0004", materialGoodsCode: "M01-00040", materialName: "น้ำตาล", requiredQty: 2, uomName: "ถุงx50กก." },
    ],
    tradeCodeRows: [
      { SKU_CODE: "M04-0079", GOODS_CODE: "M04-00790", UTQ_QTY_2: 15 },
      { SKU_CODE: "M01-0004", GOODS_CODE: "M01-00040", UTQ_QTY_2: 50 },
    ],
    receiptRows: [
      { SKU_CODE: "M04-0079", DI_DATE: "2026-08-01", DI_KEY: 1, DI_REF: "INV6908/15", UNIT_PRICE_EXCL_VAT: 39.59, COST_STATUS: "ready" },
      { SKU_CODE: "M04-0079", DI_DATE: "2026-09-19", DI_KEY: 2, DI_REF: "INV6909/317", UNIT_PRICE_EXCL_VAT: 40, COST_STATUS: "ready" },
    ],
  });

  assert.equal(rows[1].invoiceNo, "INV6909/317");
  assert.equal(rows[1].unitPrice, 600);
  assert.equal(rows[1].totalAmount, 7200);
  assert.equal(rows[1].status, "ready");
  assert.equal(rows[0].status, "missing");
});

test("cost allocation uses the frozen plan snapshot and scopes it to exported requisition goods", () => {
  const materials = buildScopedSnapshotMaterials([{
    materials: [
      { skuCode: "M04-0027", goodsCode: "M04-0027", name: "LIQUID GLUCOSE", requiredQty: 59.5, unit: "KG", itemType: "RAW" },
      { skuCode: "M04-0027", goodsCode: "M04-00270", name: "LIQUID GLUCOSE", requiredQty: 59.5, unit: "ก.ล.x24กก.", itemType: "RAW" },
      { skuCode: "M01-0004", goodsCode: "M01-0004", name: "น้ำตาลทราย", requiredQty: 73.08, unit: "KG", itemType: "RAW" },
      { skuCode: "M01-0004", goodsCode: "M01-00040", name: "น้ำตาลทราย", requiredQty: 3.5, unit: "ถุงx50กก.", itemType: "RAW" },
    ],
  }], [
    { material_sku_code: "M04-0027", material_goods_code: "M04-00270", metadata: { materialName: "LIQUID GLUCOSE", itemType: "RAW" } },
    { material_sku_code: "M01-0004", material_goods_code: "M01-00040", metadata: { materialName: "น้ำตาลทราย", itemType: "RAW" } },
    { material_sku_code: "R01-0001", material_goods_code: "R01-0001", metadata: { materialName: "ถุงรองกระบะ", itemType: "RAW" } },
  ]);

  assert.deepEqual(materials.map((item) => [item.materialCode, item.requiredQty, item.uomName]), [
    ["M04-00270", 59.5, "ก.ล.x24กก."],
    ["M01-00040", 3.5, "ถุงx50กก."],
  ]);
});

test("BOM snapshot exposes its frozen material quantities for cost review", () => {
  const rows = extractBomSnapshotMaterials([{ materials: [{
    skuCode: "M01-0004",
    goodsCode: "M01-00040",
    name: "น้ำตาลทราย",
    requiredQty: 3.5,
    issueQty: 4,
    unit: "ถุงx50กก.",
  }] }]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    key: "M01-00040-0",
    itemType: "RAW",
    skuCode: "M01-0004",
    goodsCode: "M01-00040",
    name: "น้ำตาลทราย",
    requiredQty: 3.5,
    issueQty: 4,
    uomName: "ถุงx50กก.",
  });
});

test("costing matches exported requisitions when legacy plan ids contain a shortened workstream UUID", () => {
  assert.equal(planMatchesRequisitionWorkstream({
    plan_id: "WIP-MP202609001-KP13-WKB-0002-2026-09-09-04FF0A3C-8998-4A48-B4DB-3B1F4BC5",
    schedule_section_name: "ส่วนงานป้ายแยม",
    owner_department_id: "kp13-id",
  }, {
    workstreamCode: "04ff0a3c-8998-4a48-b4db-3b1f4bc5f08a",
    workstreamName: "ส่วนงานป้ายแยม",
    ownerDepartmentId: "kp13-id",
  }), true);
});

test("parseLotToDates correctly parses YYMMDD lot numbers to ISO date and Thai BE date", () => {
  const result1 = parseLotToDates("260918");
  assert.equal(result1.isoDate, "2026-09-18");
  assert.equal(result1.thaiDateStr, "18/09/2569");
  assert.equal(result1.adYear, 2026);
  assert.equal(result1.beYear, 2569);
  assert.equal(result1.month, "09");
  assert.equal(result1.day, "18");

  // Handles lot suffix e.g. 260918/1
  const result2 = parseLotToDates("260918/1");
  assert.equal(result2.isoDate, "2026-09-18");
  assert.equal(result2.thaiDateStr, "18/09/2569");

  // Handles lot Saturday/Monday transition e.g. 260921
  const result3 = parseLotToDates("260921");
  assert.equal(result3.isoDate, "2026-09-21");
  assert.equal(result3.thaiDateStr, "21/09/2569");

  // Invalid or null lots
  assert.equal(parseLotToDates(null), null);
  assert.equal(parseLotToDates(""), null);
  assert.equal(parseLotToDates("123"), null);
  assert.equal(parseLotToDates("261332"), null);
  assert.equal(parseLotToDates("260231"), null);
});

test("costing reads six-digit WIP requisition lots as YYMMDD", () => {
  assert.equal(parseCostingLotDate("260820"), "2026-08-20");
  assert.equal(parseCostingLotDate("2108260045-1"), "2026-08-21");
});

test("cost tree shows issued packs separately from their kilogram conversion", () => {
  assert.deepEqual(resolveCostTreeUsage({
    qty: 1620,
    uomName: "ชุดx22.50 kg.",
    grossQty: 72,
    returnQty: 0,
    sourceUomName: "ชุดx22.50 kg.",
  }), { displayQty: 72, displayUom: "ถุง", baseQty: 1620 });
});

test("Joint product allocation divides batch cost proportionally by weight", () => {
  // Process 389 bags of flour = 8,752.5 kg
  const bags22_5 = 292;
  const bags18_5 = 124;
  const weightA = bags22_5 * 22.5; // 6,570 kg
  const weightB = bags18_5 * 18.5; // 2,294 kg
  const totalWeight = weightA + weightB; // 8,864 kg

  const batchCost = 139306; // Total cost (DM + DL + MOH)
  const unitCostPerKg = batchCost / totalWeight;

  const costPerBagA = unitCostPerKg * 22.5;
  const costPerBagB = unitCostPerKg * 18.5;

  assert.equal(Number(unitCostPerKg.toFixed(3)), 15.716);
  assert.equal(Number(costPerBagA.toFixed(2)), 353.61);
  assert.equal(Number(costPerBagB.toFixed(2)), 290.74);

  // Total cost reconciled
  const totalAllocated = bags22_5 * costPerBagA + bags18_5 * costPerBagB;
  assert.equal(Math.round(totalAllocated), batchCost);
});

test("Baking Yield Loss reflects evaporation: weight decreases but accumulated cost stays intact", () => {
  const doughWeight = 1050; // kg
  const doughCostPerKg = 27.9333; // Baht/kg
  const transferredInCost = doughWeight * doughCostPerKg; // 29,330 Baht

  const dlOven = 1200; // Baht
  const mohGasAndPower = 4000; // Baht (including LPG and sugar)
  const totalAccumulatedCost = transferredInCost + dlOven + mohGasAndPower; // 34,530 Baht

  const bakedCrustWeight = 780; // kg (ชั่งจริงหน้าเตา)
  const bakingYieldPct = (bakedCrustWeight / doughWeight) * 100; // 74.29%

  const bakedUnitCostPerKg = totalAccumulatedCost / bakedCrustWeight;

  assert.equal(Number(bakingYieldPct.toFixed(2)), 74.29);
  assert.equal(Number(bakedUnitCostPerKg.toFixed(2)), 44.27);
  // Unit cost per kg increased because moisture evaporated, concentration increased
  assert.ok(bakedUnitCostPerKg > doughCostPerKg);
});

test("Net DM calculation accurately subtracts returns from gross requisitions", () => {
  const requisitions = [
    { code: "M03-00220", qty: 200, unitPrice: 261.675, amount: 52335 },
    { code: "M03-00220", qty: 189, unitPrice: 261.675, amount: 49456.575 },
  ];
  const returns = [
    { code: "M03-00220", qty: 10, unitPrice: 261.675, amount: 2616.75 },
  ];

  const grossQty = requisitions.reduce((s, r) => s + r.qty, 0); // 389
  const grossAmt = requisitions.reduce((s, r) => s + r.amount, 0); // 101,791.575
  const returnQty = returns.reduce((s, r) => s + r.qty, 0); // 10
  const returnAmt = returns.reduce((s, r) => s + r.amount, 0); // 2616.75

  const netQty = grossQty - returnQty; // 379
  const netAmt = Math.round((grossAmt - returnAmt) * 100) / 100;

  assert.equal(netQty, 379);
  assert.equal(netAmt, 99174.83);
});

test("Closing a cost sheet rejects unpriced materials and unclosed transferred WIP", () => {
  const errors = validateCostSheetClose({
    actualQty: 480.7,
    materials: [
      {
        item_type: "RM",
        item_code: "M01-0004",
        lot_no: "260908",
        qty: 50,
        unit_price: 0,
        total_amount: 0,
        source_doc_ref: "XA6909/0060",
      },
      {
        item_type: "WIP",
        item_code: "WKB-0048",
        lot_no: "0909260048-1",
        qty: 481.94,
        unit_price: 20,
        total_amount: 9638.8,
        linked_cost_sheet_id: "upstream-sheet",
      },
    ],
    expenses: [{ expense_type: "DL", amount: 100 }],
    linkedSheetStatusById: { "upstream-sheet": "draft" },
  });

  assert.ok(errors.some((message) => message.includes("unit cost and amount")));
  assert.ok(errors.some((message) => message.includes("not closed")));
});

test("production output LOT date attaches to the matching master-plan day", () => {
  assert.equal(parseProductionLotDate("0909260048-1"), "2026-09-09");
  assert.equal(parseProductionLotDate("3102260001-1"), null);
  const [row] = attachOutputsToPlanRows(
    [{ skuCode: "WKB-0048", productionDate: "2026-09-09" }],
    [{ skuCode: "WKB-0048", lotNo: "0909260048-1", receiptDates: ["2026-09-18"] }]
  );
  assert.equal(row.outputs.length, 1);
});

test("Closing a cost sheet rejects unresolved allocation evidence", () => {
  const errors = validateCostSheetClose({
    actualQty: 2025.26,
    materials: [{
      item_type: "RM",
      item_code: "M09-00040",
      lot_no: "unknown",
      qty: 5,
      unit_price: 1,
      total_amount: 5,
      source_doc_ref: "manual",
      allocation_status: "missing_issue",
    }],
  });

  assert.ok(errors.some((message) => message.includes("missing_issue")));
});

test("Confirmed costing exceptions can close without inventing LOT or direct cost", () => {
  const errors = validateCostSheetClose({
    actualQty: 180,
    materials: [
      {
        item_type: "RM",
        item_code: "M01-00130",
        qty: 0,
        unit_price: 0,
        total_amount: 0,
        allocation_status: "confirmed",
        source_kind: "exception_not_used",
      },
      {
        item_type: "RM",
        item_code: "S01-0004",
        qty: 0.1818,
        unit_price: 10,
        total_amount: 1.818,
        source_doc_ref: "XA6908/0027",
        allocation_status: "confirmed",
        source_kind: "exception_direct_no_lot",
      },
    ],
  });

  assert.deepEqual(errors, []);
});

test("Closing rejects a changed central allocation quantity", () => {
  const errors = validateCentralAllocation({
    skuCode: "WKB-0048",
    materials: [{
      item_code: "M01-00130",
      lot_no: "260901",
      qty: 49,
      source_kind: "bom_central_allocation",
    }],
    preview: {
      canConfirm: true,
      allocations: [{
        productCode: "WKB-0048",
        materialCode: "M01-00130",
        lotNo: "260901",
        costQty: 50,
      }],
    },
  });
  assert.equal(errors.length, 1);
});

test("Receipt candidates combine complete LOT receipts, quantities and measured weights", () => {
  const row = { id: "1", skuCode: "WKB-0048", lotNo: "0909260048-1", productionDate: "2026-09-09", actualQty: 100, actualWeightKg: 481.94, costType: "WIP" };
  const candidates = buildProductionOutputCandidates([row, row, { ...row, id: "2", productionDate: "2026-09-10", actualQty: 50 }, { ...row, id: "3", skuCode: "FG", lotNo: null }]);
  assert.equal(candidates.find(r => r.skuCode === "WKB-0048").actualQty, 150);
  assert.equal(candidates.find(r => r.skuCode === "WKB-0048").actualWeightKg, 963.88);
  assert.equal(candidates.find(r => r.skuCode === "WKB-0048").receiptDates.length, 2);
  assert.equal(candidates.find(r => r.skuCode === "FG").canStart, false);
});

test("flour production receipts show actual material issue cost per received kg without DL or OH", () => {
  const drafts = new Map([["260820", {
    material_cost: 120600,
    output_weight_kg: 7672.5,
    unit_cost: 120600 / 7672.5,
    issue_documents: ["G6908/0074"],
    return_documents: [],
  }]]);
  const [row] = applyMaterialIssueCostToReceipts([{
    LOT_NO: "260820",
    NET_BASE_QTY: 7672.5,
    UNIT_PRICE_EXCL_VAT: 0,
    NET_AMOUNT_EXCL_VAT: 0,
    COST_STATUS: "review",
  }], drafts);

  assert.equal(Number(row.UNIT_PRICE_EXCL_VAT.toFixed(4)), 15.7185);
  assert.equal(row.NET_AMOUNT_EXCL_VAT, 120600);
  assert.equal(row.COST_SOURCE, "actual_material_issue");
  assert.deepEqual(row.ISSUE_DOCUMENTS, ["G6908/0074"]);
});

test("flour receipt lookup allows ERP posting after the LOT production date", () => {
  assert.deepEqual(productionReceiptDateRange("2026-09-21"), {
    dateFrom: "2026-09-21",
    dateTo: "2026-09-28",
  });
});

test("raw material LOT cost uses the net purchase value excluding VAT", () => {
  assert.equal(rawMaterialUnitCostExclVat({
    RECEIVED_BASE_QTY: 50000,
    NET_PURCHASE_AMOUNT: 9000,
    GROSS_AMOUNT: 9630,
    UNIT_COST: 0.18,
  }), 0.18);
});

test("all three flour-sifting WIP families use their own receipt and requisition hints", () => {
  assert.deepEqual(resolveFlourSiftingProfile("WK-22080"), { receiptSearch: "WK-2208", remarkHint: "PLD" });
  assert.deepEqual(resolveFlourSiftingProfile("WK-22020"), { receiptSearch: "WK-2202", remarkHint: "D1" });
  assert.deepEqual(resolveFlourSiftingProfile("WK-2206-1"), { receiptSearch: "WK-2206-1", remarkHint: "อินทัช" });
});

test("shell WIP costing uses actual beating-room issues before plan allocation", () => {
  assert.equal(prefersActualWipIssueAllocation("WKB-0048"), true);
  assert.equal(prefersActualWipIssueAllocation("WKB-0045"), true);
  assert.equal(prefersActualWipIssueAllocation("WK-22080"), false);
  assert.equal(prefersActualWipIssueAllocation("B06-0005"), false);
});

test("flour WIP costing keeps the trade code so each family finds its own production receipt", () => {
  assert.equal(resolveUpstreamCostSku({ materialCode: "WK-22080", materialSkuCode: "WK-2202" }), "WK-22080");
  assert.equal(resolveUpstreamCostSku({ materialCode: "WK-22020", materialSkuCode: "WK-2202" }), "WK-22020");
  assert.equal(resolveUpstreamCostSku({ materialCode: "WKB-0045", materialSkuCode: "WKB-0045" }), "WKB-0045");
});

test("resolveBiscuitSandwichRatio identifies Allpine 60:40 and general 55:45", () => {
  assert.deepEqual(resolveBiscuitSandwichRatio({ skuCode: "BL0-5001", skuName: "ออลพาย สับปะรด 5 กก." }), {
    shellRatio: 0.6,
    jamRatio: 0.4,
    category: "allpine",
    label: "ออลพาย (เปลือก 60% : แยม 40%)",
  });
  assert.deepEqual(resolveBiscuitSandwichRatio({ skuCode: "B03-0003", skuName: "Allpine Pineapple" }), {
    shellRatio: 0.6,
    jamRatio: 0.4,
    category: "allpine",
    label: "ออลพาย (เปลือก 60% : แยม 40%)",
  });
  assert.deepEqual(resolveBiscuitSandwichRatio({ skuCode: "B01-1009", skuName: "แม่มะลิ งาหอม รสงา 5 กก." }), {
    shellRatio: 0.55,
    jamRatio: 0.45,
    category: "standard",
    label: "มาตรฐาน (เปลือก 55% : แยม 45%)",
  });
  assert.deepEqual(resolveBiscuitSandwichRatio({ skuCode: "B01-1009", skuName: "งาหอม", defaultShellRatio: 0.5 }), {
    shellRatio: 0.5,
    jamRatio: 0.5,
    category: "equal",
    label: "มาตรฐาน (เปลือก 50% : แยม 50%)",
  });
});

test("allocateBiscuitSandwichShellAndJam splits shared shell and jam proportionally by formula demand", () => {
  const results = allocateBiscuitSandwichShellAndJam({
    products: [
      { skuCode: "BL0-5001", skuName: "ออลพาย 5 กก.", actualWeightKg: 100 },
      { skuCode: "B01-1009", skuName: "งาหอม 5 กก.", actualWeightKg: 100 },
    ],
    availableShellLots: [{ lotNo: "2609280002-1", weightKg: 115 }],
    availableJamLots: [{ lotNo: "JAM-LOT-1", weightKg: 85, grossQty: 90, returnQty: 5 }],
  });

  assert.equal(results.length, 2);
  const allpine = results[0];
  const standard = results[1];
  assert.equal(allpine.ratio.category, "allpine");
  assert.equal(standard.ratio.category, "standard");
  assert.equal(Number((allpine.allocatedShellWeightKg + standard.allocatedShellWeightKg).toFixed(2)), 115);
  assert.equal(Number((allpine.allocatedJamWeightKg + standard.allocatedJamWeightKg).toFixed(2)), 85);
  assert.equal(allpine.allocatedShellLots[0].weightKg > standard.allocatedShellLots[0].weightKg, true);
  assert.equal(allpine.allocatedJamLots[0].weightKg < standard.allocatedJamLots[0].weightKg, true);
});

