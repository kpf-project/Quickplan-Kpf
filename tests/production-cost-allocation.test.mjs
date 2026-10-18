import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMaterialSkuLookup,
  actualBomDemand,
  allocateSharedIssuesByBom,
  collectGatewayCursorRows,
  excludePreviewDocumentsOwnedByOtherOutputs,
  filterActualRequisitionRows,
  isRequisitionDocumentNo,
  netIssueLinesByReturns,
  productionRequisitionFallbackDate,
  productionRequisitionIssueDates,
  productionRequisitionLoadScopes,
  requisitionRemarkMatchesProductionDate,
  resolveAllocatedIssueUnitCost,
  selectBiscuitShellRequisitionDocuments,
  selectRequisitionDocuments,
  selectRoutedRequisitionDocuments,
  selectRequisitionPreviewGroup,
  selectRequisitionPreviewGroups,
  selectPreviewDocumentNosForOutput,
} from "../src/lib/productionCostAllocation.js";

test("costing searches requisitions up to three days before production", () => {
  assert.deepEqual(productionRequisitionIssueDates("2026-08-13"), [
    "2026-08-12",
    "2026-08-11",
    "2026-08-10",
  ]);
});

test("costing fetches every Preview document directly when document numbers exist", () => {
  assert.deepEqual(productionRequisitionLoadScopes("2026-09-28", [
    "X6909/0586",
    "X6909/0587",
    "X6909/0586",
  ]), [{ documentRefs: "X6909/0586|X6909/0587" }]);
});

test("costing loads every requisition cursor page before matching documents", async () => {
  const cursors = [];
  const rows = await collectGatewayCursorRows(async (cursor) => {
    cursors.push(cursor);
    return cursor
      ? { rows: [{ DI_REF: "X6909/0587" }], nextCursor: null, hasMore: false }
      : { rows: [{ DI_REF: "X6909/0619" }], nextCursor: "page-2", hasMore: true };
  });

  assert.deepEqual(cursors, [null, "page-2"]);
  assert.deepEqual(rows.map((row) => row.DI_REF), ["X6909/0619", "X6909/0587"]);
});

test("requisition fallback uses Saturday for Monday production", () => {
  assert.equal(productionRequisitionFallbackDate("2026-09-28"), "2026-09-26");
  assert.equal(productionRequisitionFallbackDate("2026-09-29"), "2026-09-28");
});

test("Monday biscuit shell fallback ignores Sunday and uses Saturday", () => {
  const selected = selectBiscuitShellRequisitionDocuments({
    productionDate: "2026-09-28",
    wantedCodes: ["M04-00270"],
    rows: [
      { DI_REF: "X6909/0998", DI_DATE: "2026-09-27T00:00:00.000Z", DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 28/09/69", TRD_SH_CODE: "M04-00270" },
      { DI_REF: "X6909/0999", DI_DATE: "2026-09-26T00:00:00.000Z", DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 28/09/69", TRD_SH_CODE: "M04-00270" },
    ],
  });

  assert.deepEqual(selected.map(([documentNo]) => documentNo), ["X6909/0999"]);
});

test("biscuit shell WIP uses only the previous day's biscuit mixing requisitions", () => {
  const selected = selectBiscuitShellRequisitionDocuments({
    productionDate: "2026-08-18",
    wantedCodes: ["M04-00270", "M04-00790"],
    rows: [
      { DI_REF: "XA6908/0004", DI_DATE: "2026-08-17T00:00:00.000Z", DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 18/08/69", TRD_SH_CODE: "M04-00270" },
      { DI_REF: "XA6908/0005", DI_DATE: "2026-08-17T00:00:00.000Z", DI_REMARK: "ชั่งสูตรครีม แผนผลิต 18/08/69", TRD_SH_CODE: "M04-00790" },
      { DI_REF: "XA6908/9999", DI_DATE: "2026-08-16T00:00:00.000Z", DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 18/08/69", TRD_SH_CODE: "M04-00790" },
    ],
  });

  assert.deepEqual(selected.map(([documentNo]) => documentNo), ["XA6908/0004"]);
});

test("costing falls back to the previous Preview date when FG is received one day late", () => {
  const groups = [
    { document_no: "XA6909/0072", metadata: { parentSku: "B06-0006", selectedDate: "2026-09-11" } },
    { document_no: "XA6909/0084", metadata: { parentSku: "BL0-1109", selectedDate: "2026-09-12" } },
  ];

  assert.equal(selectRequisitionPreviewGroup({
    groups,
    skuCode: "B06-0006",
    productionDate: "2026-09-12",
    fallbackDate: "2026-09-11",
  })?.document_no, "XA6909/0072");
});

test("costing keeps every Preview document for the same product and production date", () => {
  const groups = [
    { document_no: "X6909/0586", metadata: { parentSku: "BL0-1104", selectedDate: "2026-09-28" } },
    { document_no: "X6909/0587", metadata: { parentSku: "BL0-1104", selectedDate: "2026-09-28" } },
    { document_no: "XA6909/0228", metadata: { parentSku: "B03-0003", selectedDate: "2026-09-29" } },
  ];

  assert.deepEqual(selectRequisitionPreviewGroups({
    groups,
    skuCode: "bl0-1104",
    productionDate: "2026-09-28",
    fallbackDate: "2026-09-27",
  }).map((group) => group.document_no), ["X6909/0586", "X6909/0587"]);
});

test("Preview documents prefer the exact output SKU and only fall back to unassigned room documents", () => {
  const groups = [
    { document_no: "XA6909/0101", metadata: { roomId: "room-bis01", parentSku: "WKB-0002" } },
    { document_no: "XA6909/0102", metadata: { roomId: "room-bis01", parentSku: "WKB-0048" } },
    { document_no: "XA6909/0103", metadata: { roomId: "room-bis01", parentSku: null } },
    { document_no: "XA6909/0104", metadata: { roomId: "other-room", parentSku: "WKB-0002" } },
  ];

  assert.deepEqual(selectPreviewDocumentNosForOutput({
    groups,
    skuCode: "wkb-0002",
    roomIds: ["room-bis01"],
  }), ["XA6909/0101"]);
  assert.deepEqual(selectPreviewDocumentNosForOutput({
    groups,
    skuCode: "WKB-0099",
    roomIds: ["room-bis01"],
  }), ["XA6909/0103"]);
});

test("actual issues resolve trade codes to their canonical BOM SKU", () => {
  const rows = applyMaterialSkuLookup([
    { materialCode: "M01-00040" },
    { materialCode: "M01-00130" },
    { materialCode: "M01-0013-10" },
  ], new Map([
    ["M01-00040", "M01-0004"],
    ["M01-00130", "M01-0013"],
    ["M01-0013-10", "M01-0013-1"],
  ]));

  assert.deepEqual(rows.map((row) => row.materialSkuCode), ["M01-0004", "M01-0013", "M01-0013-1"]);
  const result = allocateSharedIssuesByBom({
    products: [{ productCode: "WKB-0048", materials: [
      { materialSkuCode: "M01-0004", materialCode: "M01-0004", requiredQty: 100 },
      { materialSkuCode: "M01-0013", materialCode: "M01-0013", requiredQty: 100 },
    ] }],
    issueLines: rows.map((row) => ({ ...row, issueQty: 1 })),
  });
  assert.deepEqual(result.allocations.map((row) => row.materialCode), ["M01-00040", "M01-00130"]);
  assert.deepEqual(result.unmatchedIssues.map((row) => row.materialCode), ["M01-0013-10"]);
});

test("costing accepts only X and XA requisition document numbers", () => {
  assert.equal(isRequisitionDocumentNo("X6907/0647"), true);
  assert.equal(isRequisitionDocumentNo("XA6908/0027"), true);
  assert.equal(isRequisitionDocumentNo("G6908/0074"), false);
  assert.equal(isRequisitionDocumentNo("IR6908/0603"), false);
  const selected = selectRequisitionDocuments({
    rows: [
      { DI_REF: "G6908/0074", DI_REMARK: "ตีแป้งบิสกิต", TRD_SH_CODE: "M03-00280" },
      { DI_REF: "XA6908/0027", DI_REMARK: "ตีแป้งบิสกิต", TRD_SH_CODE: "M04-00790" },
    ],
    wantedCodes: ["M03-00280", "M04-00790"],
    roomTerms: ["ตีแป้งบิสกิต"],
  });
  assert.deepEqual(selected.map(([documentNo]) => documentNo), ["XA6908/0027"]);
});

test("costing matches requisition production dates written in Thai or ISO format", () => {
  assert.equal(requisitionRemarkMatchesProductionDate("ตีแป้งบิสกิต แผนการผลิต, 09/09/69", "2026-09-09"), true);
  assert.equal(requisitionRemarkMatchesProductionDate("ตีแป้งบิสกิต แผนการผลิต, 09/09/2569", "2026-09-09"), true);
  assert.equal(requisitionRemarkMatchesProductionDate("ตีแป้งบิสกิต แผนการผลิต, 2026/09/09", "2026-09-09"), true);
  assert.equal(requisitionRemarkMatchesProductionDate("ตีแป้งบิสกิต แผนการผลิต, 2026/09/10", "2026-09-09"), false);
});

test("actual requisition selection prefers the production room and otherwise the best BOM overlap", () => {
  const rows = [
    { DI_REF: "XA6908/0026", DI_REMARK: "กะ 1 - ตีแป้งบิสกิต - แผนผลิต 21/08/69", TRD_SH_CODE: "RM-1" },
    { DI_REF: "X6908/0021", DI_REMARK: "กะ 1 - แพ็คสินค้า - แผนผลิต 21/08/69", TRD_SH_CODE: "PK-1" },
  ];
  assert.deepEqual(selectRequisitionDocuments({ rows, wantedCodes: ["RM-1"], roomTerms: ["ตีแป้งบิสกิต"] }).map(([ref]) => ref), ["XA6908/0026"]);
  assert.deepEqual(selectRequisitionDocuments({ rows, wantedCodes: ["PK-1"], roomTerms: [] }).map(([ref]) => ref), ["X6908/0021"]);
});

test("an FG without a plan selects the packaging document with the strongest BOM overlap", () => {
  const rows = [
    { DI_REF: "X6909/0235", DI_REMARK: "เบิกแยม แผน 12/09/2569", TRD_SH_CODE: "M04-0088" },
    { DI_REF: "XA6909/0086", DI_REMARK: "แพ็คงานเรือนจำ โบตั๋น KL L แผนผลิต 12/09/2569", TRD_SH_CODE: "P18-0015" },
    { DI_REF: "XA6909/0086", DI_REMARK: "แพ็คงานเรือนจำ โบตั๋น KL L แผนผลิต 12/09/2569", TRD_SH_CODE: "S01-0435" },
    { DI_REF: "XA6909/0086", DI_REMARK: "แพ็คงานเรือนจำ โบตั๋น KL L แผนผลิต 12/09/2569", TRD_SH_CODE: "OUTSIDE-BOM" },
  ];

  assert.deepEqual(selectRequisitionDocuments({
    rows,
    wantedCodes: ["M04-0088", "P18-0015", "S01-0435", "S02-0013"],
    roomTerms: [],
  }).map(([ref]) => ref), ["XA6909/0086"]);
});

test("routing selects one confident requisition per production room", () => {
  const selected = selectRoutedRequisitionDocuments({
    routingRows: [
      { workCenterId: "BIS01", workCenterName: "ห้องตีแป้งบิสกิต", componentSkuCode: "WK-2208" },
      { workCenterId: "BIS03", workCenterName: "ห้องป้ายแยม", componentSkuCode: "S01-0261" },
      { workCenterId: "BIS03", workCenterName: "ห้องป้ายแยม", componentSkuCode: "S01-0264" },
      { workCenterId: "BIS03", workCenterName: "ห้องป้ายแยม", componentSkuCode: "M04-0088" },
    ],
    rows: [
      { DI_REF: "X6908/0271", DI_REMARK: "ตีแป้งบิสกิต แผนการผลิต 13/08/2569", TRD_SH_CODE: "WK-22080", materialSkuCode: "WK-2208" },
      { DI_REF: "X6908/0273", DI_REMARK: "โบตั๋น KL XL แผนการผลิต 13/08/2569", TRD_SH_CODE: "S01-0261", materialSkuCode: "S01-0261" },
      { DI_REF: "X6908/0273", DI_REMARK: "โบตั๋น KL XL แผนการผลิต 13/08/2569", TRD_SH_CODE: "S01-0264", materialSkuCode: "S01-0264" },
      { DI_REF: "X6908/0274", DI_REMARK: "ป้ายแยมโบตั๋น แผนการผลิต 13/08/2569", TRD_SH_CODE: "M04-0088", materialSkuCode: "M04-0088" },
      { DI_REF: "X6908/0275", DI_REMARK: "ป้ายแยม แผนการผลิต 13/08/2569", TRD_SH_CODE: "M04-0088", materialSkuCode: "M04-0088" },
    ],
  });

  assert.deepEqual(selected.map(([documentNo]) => documentNo).sort(), ["X6908/0271", "X6908/0273"]);
});

test("routing never borrows a similar BOM document from another department", () => {
  const selected = selectRoutedRequisitionDocuments({
    routingRows: [
      {
        workCenterId: "BIS03",
        workCenterName: "ห้องป้ายแยม",
        componentSkuCode: "P18-0015",
        issueOwnerDepartmentCode: "KP13",
      },
      {
        workCenterId: "BIS03",
        workCenterName: "ห้องป้ายแยม",
        componentSkuCode: "S02-0013",
        issueOwnerDepartmentCode: "KP13",
      },
    ],
    rows: [
      { DI_REF: "XA6909/0221", DEPT_CODE: "KP40", DI_REMARK: "สติ๊ก ช็อก KL L", TRD_SH_CODE: "P18-0015" },
      { DI_REF: "XA6909/0221", DEPT_CODE: "KP40", DI_REMARK: "สติ๊ก ช็อก KL L", TRD_SH_CODE: "S02-0013" },
      { DI_REF: "X6909/0619", DEPT_CODE: "KP13", DI_REMARK: "บีเวอร์แยมสับปะรด", TRD_SH_CODE: "S02-0013" },
    ],
  });

  assert.deepEqual(selected.map(([documentNo]) => documentNo), ["X6909/0619"]);
});

test("costing never borrows a Preview document assigned to another output", () => {
  const filtered = excludePreviewDocumentsOwnedByOtherOutputs({
    skuCode: "BL0-1104",
    rows: [
      { DI_REF: "XA6909/0224", TRD_SH_CODE: "S02-0013" },
      { DI_REF: "X6909/0619", TRD_SH_CODE: "S02-0013" },
    ],
    groups: [{ document_no: "XA6909/0224", metadata: { parentSku: "BL0-5030" } }],
  });

  assert.deepEqual(filtered.map((row) => row.DI_REF), ["X6909/0619"]);
});

test("BL0-1104 packaging chooses X6909/0587 over the weaker X6909/0619 match", () => {
  const routingRows = ["P18-0015", "S04-0002-1", "S02-0013", "S01-0022", "S02-0005", "P14-6026", "R00-0028-1", "S01-0435"]
    .map((componentSkuCode) => ({
      workCenterId: "BIS03",
      componentSkuCode,
      issueOwnerDepartmentCode: "KP13",
    }));
  const rows = [
    ...["S02-0005", "S02-0013", "N26-00060", "N27-00090", "Q06-0001", "P19-0054"]
      .map((TRD_SH_CODE) => ({ DI_REF: "X6909/0619", DEPT_CODE: "KP13", TRD_SH_CODE })),
    ...["P18-0015", "S04-0002-1", "S02-0013", "S01-0022", "S02-0005", "P14-6026", "R00-0028-1", "S01-0435"]
      .map((TRD_SH_CODE) => ({ DI_REF: "X6909/0587", DEPT_CODE: "KP13", TRD_SH_CODE })),
  ];

  assert.deepEqual(selectRoutedRequisitionDocuments({ rows, routingRows }).map(([documentNo]) => documentNo), ["X6909/0587"]);
});

test("Preview room selects every actual requisition document for the shared production group", () => {
  const rows = [
    { DI_REF: "XA6908/0026", DI_REMARK: "กะ 1 - ตีแป้งบิสกิต - แผนผลิต 21/08/69", TRD_SH_CODE: "M01-00040" },
    { DI_REF: "XA6908/0027", DI_REMARK: "กะ 1 - ตีแป้งบิสกิต - แผนผลิต 21/08/69", TRD_SH_CODE: "WK-22080" },
    { DI_REF: "XA6908/0021", DI_REMARK: "กะ 1 - แครกเกอร์สมุย - แผนผลิต 21/08/69", TRD_SH_CODE: "P18-0015" },
  ];
  const result = selectRequisitionDocuments({
    rows,
    wantedCodes: ["M01-00040", "WK-22080"],
    roomTerms: ["ตีแป้งบิสกิต"],
  });

  assert.deepEqual(result.map(([documentNo]) => documentNo), ["XA6908/0026", "XA6908/0027"]);
});

test("costing uses the requisition number exported by Preview before guessing from BOM overlap", () => {
  const rows = [
    { DI_REF: "X6909/0235", DI_REMARK: "บรรจุภัณฑ์สินค้าอื่น แผน 12/09/2569", TRD_SH_CODE: "P18-0015" },
    { DI_REF: "XA6909/0086", DI_REMARK: "แพ็คงานเรือนจำ โบตั๋น KL L แผนผลิต 12/09/2569", TRD_SH_CODE: "P18-0015" },
  ];

  assert.deepEqual(selectRequisitionDocuments({
    rows,
    wantedCodes: ["P18-0015"],
    preferredDocumentNos: ["XA6909/0086"],
  }).map(([ref]) => ref), ["XA6909/0086"]);
});

test("Preview document remains eligible when its ERP remark format is inconsistent", () => {
  const rows = filterActualRequisitionRows({
    productionDate: "2026-08-18",
    preferredDocumentNos: ["XA6908/0004"],
    rows: [
      { DI_REF: "XA6908/0004", DI_ACTIVE: 0, DI_REMARK: "ข้อความเก่าที่ไม่มีวันที่แผน" },
      { DI_REF: "XA6908/0005", DI_ACTIVE: 0, DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 18/08/69" },
      { DI_REF: "G6908/0004", DI_ACTIVE: 0, DI_REMARK: "ตีแป้งบิสกิต แผนผลิต 18/08/69" },
    ],
  });

  assert.deepEqual(rows.map((row) => row.DI_REF), ["XA6908/0004", "XA6908/0005"]);
});

test("WIP cost never falls back to an ERP issue price with a different unit basis", () => {
  assert.equal(resolveAllocatedIssueUnitCost({
    itemType: "WIP",
    nestedUnitCost: null,
    rawMaterialUnitCost: 331.88,
    sourceUnitCost: 331.88,
  }), null);
  assert.equal(resolveAllocatedIssueUnitCost({ itemType: "WIP", nestedUnitCost: 14.65 }), 14.65);
  assert.equal(resolveAllocatedIssueUnitCost({ itemType: "RM", rawMaterialUnitCost: 26.75, sourceUnitCost: 25 }), 26.75);
});

test("returns reduce the exact requisition material and LOT before allocation", () => {
  const result = netIssueLinesByReturns({
    issueLines: [
      { sourceDocRef: "XA6909/0061", itemCode: "WK-22080", lotNo: "260907", issueQty: 72 },
      { sourceDocRef: "XA6909/0061", itemCode: "M04-00790", lotNo: "260827", issueQty: 7 },
    ],
    returnLines: [
      { sourceDocRef: "XA6909/0061", returnDocRef: "IR6909/0100", itemCode: "WK-22080", lotNo: "260907", returnQty: 2 },
      { sourceDocRef: "XA6909/9999", itemCode: "WK-22080", lotNo: "260907", returnQty: 1 },
    ],
  });

  assert.equal(result.issueLines.find((row) => row.itemCode === "WK-22080").issueQty, 70);
  assert.deepEqual(result.issueLines.find((row) => row.itemCode === "WK-22080").returnDocRefs, ["IR6909/0100"]);
  assert.equal(result.issueLines.find((row) => row.itemCode === "M04-00790").issueQty, 7);
  assert.equal(result.unmatchedReturns.length, 1);
});

test("a full return removes the issue from cost allocation", () => {
  const result = netIssueLinesByReturns({
    issueLines: [{ sourceDocRef: "XA6909/0060", itemCode: "M01-00040", lotNo: "260908", issueQty: 2 }],
    returnLines: [{ sourceDocRef: "XA6909/0060", itemCode: "M01-00040", lotNo: "260908", returnQty: 2 }],
  });

  assert.equal(result.issueLines.length, 0);
  assert.equal(result.zeroUseLines.length, 1);
  assert.equal(result.zeroUseLines[0].grossIssueQty, 2);
  assert.equal(result.zeroUseLines[0].returnQty, 2);
  assert.equal(result.reconciliation[0].netIssueQty, 0);
  assert.equal(result.reconciliation[0].status, "balanced");

  const evidence = allocateSharedIssuesByBom({
    products: [{ productCode: "WKB-0048", materials: [
      { materialSkuCode: "M01-0004", materialCode: "M01-0004", requiredQty: 100 },
    ] }],
    issueLines: result.zeroUseLines.map((row) => ({
      ...row,
      materialSkuCode: "M01-0004",
      materialCode: "M01-00040",
      issueQty: row.grossIssueQty,
    })),
  });
  assert.equal(evidence.allocations[0].allocatedQty, 2);
  assert.equal(evidence.allocations[0].demandMaterialKey, "M01-0004");
});

test("central allocator splits every issue lot by BOM demand and reconciles to the issued total", () => {
  const result = allocateSharedIssuesByBom({
    products: [
      { productCode: "WKB-0002", materials: [{ materialCode: "WK-22080", requiredQty: 42, packSize: 22.5 }] },
      { productCode: "WKB-0048", materials: [{ materialCode: "WK-22080", requiredQty: 30, packSize: 22.5 }] },
    ],
    issueLines: [{ itemCode: "WK-22080", materialSkuCode: "WK-2208", lotNo: "260907", issueQty: 72, packSize: 22.5, sourceDocRef: "XA6909/0061" }],
  });

  assert.deepEqual(result.allocations.map((row) => [row.productCode, row.allocatedQty]), [
    ["WKB-0002", 42],
    ["WKB-0048", 30],
  ]);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.allocatedQty, 0), 72);
  assert.equal(result.allocations[0].sourceMaterialSkuCode, "WK-2208");
  assert.equal(result.reconciliation[0].status, "matched");
});

test("shared room issues follow actual output weight multiplied by each product BOM", () => {
  const result = allocateSharedIssuesByBom({
    products: [
      { productCode: "WKB-0002|2807260002-1", materials: [{ materialCode: "RM-1", requiredQty: actualBomDemand(10, 2645.03, 1000) }] },
      { productCode: "WKB-0045|2807260045-1", materials: [{ materialCode: "RM-1", requiredQty: actualBomDemand(20, 2366.57, 1000) }] },
    ],
    issueLines: [{ materialCode: "RM-1", issueQty: 100, packSize: 1, sourceDocRef: "XA6907/0647" }],
  });
  const samui = result.allocations.find((row) => row.productCode === "WKB-0045|2807260045-1");
  const expected = 100 * (47.3314 / (26.4503 + 47.3314));

  assert.ok(Math.abs(samui.allocatedQty - expected) < 0.000001);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.allocatedQty, 0), 100);
});

test("one weighed shell receives the entire shared issue", () => {
  const result = allocateSharedIssuesByBom({
    products: [
      { productCode: "WKB-0002|1808260002-1", materials: [{ materialCode: "RM-1", requiredQty: actualBomDemand(10, 3491.97, 1000) }] },
    ],
    issueLines: [{ materialCode: "RM-1", issueQty: 100, packSize: 1, sourceDocRef: "XA6908/0004" }],
  });

  assert.equal(result.allocations[0].allocatedQty, 100);
});

test("central allocator preserves lot totals, reports missing BOM issues, and leaves unrelated issues unmatched", () => {
  const result = allocateSharedIssuesByBom({
    products: [
      { productCode: "WKB-0002", materials: [{ materialSkuCode: "M04-0079", goodsCode: "M04-00790", requiredQty: 14, packSize: 15 }] },
      { productCode: "WKB-0048", materials: [
        { materialSkuCode: "M04-0079", goodsCode: "M04-00790", requiredQty: 5, packSize: 15 },
        { materialCode: "M09-00040", requiredQty: 5, packSize: 50 },
      ] },
    ],
    issueLines: [
      { itemCode: "M04-00790", lotNo: "260827", issueQty: 7, packSize: 15 },
      { itemCode: "M04-00790", lotNo: "260828", issueQty: 5, packSize: 15 },
      { itemCode: "R01-0001", lotNo: "260831", issueQty: 15, packSize: 1 },
    ],
  });

  const margarine = result.allocations.filter((row) => row.materialCode === "M04-00790");
  assert.equal(Number(margarine.reduce((sum, row) => sum + row.allocatedQty, 0).toFixed(6)), 12);
  assert.equal(result.missingIssues[0].materialCode, "M09-00040");
  assert.equal(result.unmatchedIssues[0].itemCode, "R01-0001");
  assert.equal(result.reconciliation.find((row) => row.materialKey === "M04-00790").status, "variance");
});

test("an issued trade code satisfies unissued alias rows under the same SKU", () => {
  const result = allocateSharedIssuesByBom({
    products: [{ productCode: "WKB-0002", materials: [
      { materialSkuCode: "M04-0079", materialCode: "M04-0079", requiredQty: 35, uomName: "KG" },
      { materialSkuCode: "M04-0079", materialCode: "M04-00790", requiredQty: 14, uomName: "กล่องx15" },
    ] }],
    issueLines: [{ materialSkuCode: "M04-0079", materialCode: "M04-00790", issueQty: 12, packSize: 15 }],
  });

  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].materialKey, "M04-00790");
  assert.equal(result.missingIssues.length, 0);
});

test("an issued pack trade code falls back to its unique BOM SKU", () => {
  const result = allocateSharedIssuesByBom({
    products: [{ productCode: "WKB-0048", materials: [
      { materialSkuCode: "M01-0004", materialCode: "M01-0004", requiredQty: 100, uomName: "KG" },
    ] }],
    issueLines: [
      { materialSkuCode: "M01-0004", materialCode: "M01-00040", issueQty: 2, packSize: 50, uomName: "ถุงx50กก." },
    ],
  });

  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].materialCode, "M01-00040");
  assert.equal(result.allocations[0].materialKey, "M01-0004");
  assert.equal(result.allocations[0].allocatedBaseQty, 100);
  assert.equal(result.missingIssues.length, 0);
});

test("a shared issue is split when one BOM stores the trade code and another stores its SKU", () => {
  const result = allocateSharedIssuesByBom({
    products: [
      { productCode: "WKB-0002", materials: [
        { materialSkuCode: "M01-0013", materialCode: "M01-00130", requiredQty: 60, uomName: "KG" },
      ] },
      { productCode: "WKB-0048", materials: [
        { materialSkuCode: "M01-0013", materialCode: "M01-0013", requiredQty: 40, uomName: "KG" },
      ] },
    ],
    issueLines: [
      { materialSkuCode: "M01-0013", materialCode: "M01-00130", issueQty: 2, packSize: 50, uomName: "ถุงx50กก." },
    ],
  });

  assert.deepEqual(result.allocations.map((row) => [row.productCode, row.allocatedBaseQty]), [
    ["WKB-0002", 60],
    ["WKB-0048", 40],
  ]);
  assert.equal(result.missingIssues.length, 0);
});
