import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function createSupabaseStub({ data = [], error = null } = {}) {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    in(column, values) {
      calls.push(["in", column, values]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
  return {
    calls,
    client: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
    },
  };
}

test("includes only policy-enabled WIP while preserving RAW and PACK snapshot materials", async () => {
  const { mapRequisitionSnapshotMaterials } = await import("../src/lib/requisitionMaterialPolicy.js");
  const planRow = {
    bom_snapshot: [{
      materials: [
        { skuCode: "RAW-1", goodsCode: "RAW-1-A", itemType: "RAW", issueQty: 4, name: "Raw" },
        { skuCode: "PACK-1", itemType: "PACK", issueQty: 2, name: "Pack" },
        { skuCode: "WIP-OFF", itemType: "WIP", issueQty: 3, name: "Off" },
        { skuCode: "wip-on", itemType: "WIP", issueQty: 5, name: "On" },
      ],
    }],
  };

  const rows = mapRequisitionSnapshotMaterials(planRow, new Set(["WIP-ON"]));

  assert.deepEqual(rows.map((row) => row.materialSkuCode), ["RAW-1", "PACK-1", "WIP-ON"]);
  assert.equal(rows.at(-1).itemType, "WIP");
});

test("collects normalized WIP SKUs once from plan snapshots", async () => {
  const { collectSnapshotWipSkuCodes } = await import("../src/lib/requisitionMaterialPolicy.js");
  const codes = collectSnapshotWipSkuCodes([
    { bom_snapshot: [{ materials: [{ skuCode: "wip-a", itemType: "WIP", issueQty: 1 }] }] },
    { bom_snapshot: [{ materials: [{ skuCode: "WIP-A", itemType: "WIP", issueQty: 2 }, { skuCode: "RAW", itemType: "RAW", issueQty: 1 }] }] },
  ]);
  assert.deepEqual(codes, ["WIP-A"]);
});

test("loads only active WIP policies explicitly enabled for requisition", async () => {
  const { loadRequiredRequisitionWipSkuSet } = await import("../src/lib/requisitionMaterialPolicy.js");
  const stub = createSupabaseStub({
    data: [
      { sku_code: "WIP-ON", is_active: true, requires_requisition: true },
      { sku_code: "WIP-INACTIVE", is_active: false, requires_requisition: true },
      { sku_code: "WIP-OFF", is_active: true, requires_requisition: false },
    ],
  });

  const result = await loadRequiredRequisitionWipSkuSet(stub.client, ["WIP-ON", "WIP-INACTIVE", "WIP-OFF"]);

  assert.deepEqual([...result], ["WIP-ON"]);
  assert.ok(stub.calls.some((call) => call[0] === "eq" && call[1] === "is_active" && call[2] === true));
  assert.ok(stub.calls.some((call) => call[0] === "eq" && call[1] === "requires_requisition" && call[2] === true));
});

test("fails closed when the requires_requisition migration is not available", async () => {
  const { loadRequiredRequisitionWipSkuSet } = await import("../src/lib/requisitionMaterialPolicy.js");
  const stub = createSupabaseStub({ error: { code: "PGRST204", message: "requires_requisition column missing" } });
  const result = await loadRequiredRequisitionWipSkuSet(stub.client, ["WIP-A"]);
  assert.deepEqual([...result], []);
});

test("preview and confirm use the same WIP requisition policy helper", () => {
  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirm = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");
  for (const source of [preview, confirm]) {
    assert.match(source, /collectSnapshotWipSkuCodes/);
    assert.match(source, /loadRequiredRequisitionWipSkuSet/);
    assert.match(source, /mapRequisitionSnapshotMaterials/);
    assert.doesNotMatch(source, /item\.itemType !== "WIP"/);
  }
});

test("preview and confirm retain direct WIP candidates before applying the requisition policy", () => {
  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirm = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");
  const claimPool = readSource("src/lib/materialClaimPool.js");

  for (const source of [preview, confirm]) {
    assert.match(
      source,
      /loadMainPlanRowsForClaimDemand\(supabaseAdmin,\s*\{[^}]*includeWipMaterials:\s*true[^}]*\}\)/s
    );
  }

  assert.match(claimPool, /const includeWipMaterials = options\?\.includeWipMaterials === true;/);
  assert.match(
    claimPool,
    /itemType === "RAW" \|\| \(includeWipMaterials && itemType === "WIP"\)/
  );
});

test("WIP policy settings detect, save, and render requiresRequisition", () => {
  const source = readSource("src/features/production-line-settings/components/WipPoliciesSettingsTab.js");
  assert.match(source, /Boolean\(draft\.requiresRequisition\) !== Boolean\(row\.requiresRequisition\)/);
  assert.match(source, /requiresRequisition:\s*Boolean\(draft\.requiresRequisition\)/);
  assert.match(source, /เบิกจากคลัง/);
  assert.match(source, /checked=\{merged\.requiresRequisition === true\}/);
  assert.ok((source.match(/colSpan=\{8\}/g) || []).length >= 2);
});

test("WIP requisition lines share room routing, Excel, and FIFO auto-LOT infrastructure", () => {
  const routing = readSource("src/features/production-line-settings/components/RoutingSettingsTab.js");
  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirm = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");
  const lotExport = readSource("src/lib/requisitionLotExport.js");
  const gateway = readSource("kpf-api-gateway/server.js");

  assert.match(routing, /fetchProductionWipPolicies/);
  assert.match(routing, /allowMasterPlan === true/);
  assert.match(routing, /item\.itemType === "WIP"/);
  assert.match(routing, /สินค้า FG \/ WIP/);
  assert.match(routing, /componentType:\s*item\.component_type \|\| deriveItemType/);
  assert.match(routing, /workCenterId:\s*mapped\?\.work_center_id/);
  assert.match(
    preview,
    /routingByKey\.get\(`\$\{qaDepartmentId \|\| ""\}\|\$\{parentSku\}\|\$\{material\.materialSkuCode\}`\)/
  );
  assert.match(confirm, /allocateLotNumbersForExportRows/);
  assert.match(confirm, /lotKey:\s*"เลขล็อต"/);
  assert.match(lotExport, /fetchLotsByParentCode\(parentCodes\)/);
  assert.match(gateway, /app\.get\("\/api\/raw-material-lots-by-parent"/);
  assert.doesNotMatch(gateway.slice(gateway.indexOf('app.get("/api/raw-material-lots-by-parent"'), gateway.indexOf('app.get("/api/raw-material-lots-by-parent"') + 5000), /ICCAT_CODE\s+IN/i);
});

test("requisition Excel uses location 02 for WIP and 04 for other materials", async () => {
  const { resolveRequisitionStorageLocation } = await import("../src/lib/requisitionStorageLocation.js");
  assert.equal(resolveRequisitionStorageLocation({ itemType: "WIP", materialSkuCode: "WIP-A" }), "02");
  assert.equal(resolveRequisitionStorageLocation({ categoryCode: "03", materialSkuCode: "WK-2208" }), "02");
  assert.equal(resolveRequisitionStorageLocation({ materialSkuCode: "WK-2208" }), "02");
  assert.equal(resolveRequisitionStorageLocation({ materialSkuCode: "WKB-0058" }), "02");
  assert.equal(resolveRequisitionStorageLocation({ itemType: "RAW", materialSkuCode: "M01-0013" }), "04");
  assert.equal(resolveRequisitionStorageLocation({ itemType: "PACK", materialSkuCode: "S01-0004" }), "04");

  const exportRoutes = [
    readSource("src/app/api/production-planning/requisition/export/route.js"),
    readSource("src/app/api/production-planning/requisition/confirm-daily/route.js"),
    readSource("src/app/api/production-planning/requisition/supplemental/export/route.js"),
  ];
  exportRoutes.forEach((source) => {
    assert.match(source, /resolveRequisitionStorageLocation/);
    assert.match(source, /locationKey:\s*"ตำแหน่งเก็บ"/);
    assert.doesNotMatch(source, /"ตำแหน่งเก็บ":\s*"1"/);
  });
});

test("requisition FIFO keeps stock without a LOT and resolves ERP category 03 to warehouse 02", () => {
  const lotExport = readSource("src/lib/requisitionLotExport.js");

  assert.match(lotExport, /if \(!parentCode \|\| !warehouseCode \|\| availableBaseQty <= 0\) return;/);
  assert.doesNotMatch(lotExport, /!parentCode \|\| !lotNo/);
  assert.match(lotExport, /categoryCode: normalizeCode\(exactRow\.ICCAT_CODE\)/);
  assert.match(lotExport, /resolveRequisitionStorageLocation\(\{/);
  assert.match(lotExport, /lot_no: lotNo \|\| null/);
  assert.match(lotExport, /lots\.sort\(compareLotsByEncodedDate\)/);
  assert.doesNotMatch(lotExport, /leftDate\.localeCompare\(rightDate\)/);
  assert.match(lotExport, /conventionalPackQtyToBaseQty\(requiredTradeQty, tradeMeta\.packSize\)/);
  assert.match(lotExport, /allocatePreferredPhysicalBaseQty/);
  assert.match(lotExport, /tradeMeta\.packSize > 1\s*\? \["pack", "base"\]\s*:\s*\["base", "pack"\]/);
  assert.match(lotExport, /baseQtyToConventionalTradeQty\(allocatedBaseQty, actualPackSize\)/);
  assert.match(lotExport, /actualTradeCode: actualTradeMeta\.tradeCode/);
  assert.match(lotExport, /sku_code: actualTradeMeta\?\.tradeCode/);
  assert.doesNotMatch(lotExport, /material_goods_code: actualTradeMeta\?\.tradeCode/);
  assert.match(lotExport, /if \(unallocatedBaseQty > 0\)/);
  assert.match(lotExport, /if \(!allowPartialStock\)/);
  assert.match(lotExport, /isPartialStock: shortages\.length > 0/);
  assert.match(lotExport, /fifoAllocation/);
  assert.doesNotMatch(lotExport, /buildTradeMetaFallback/);
});

test("requisition routing never borrows a conflicting room from another parent SKU", async () => {
  const { buildRequisitionRoutingMap } = await import("../src/lib/requisitionRouting.js");
  const departmentId = "DEPT-1";
  const rows = [
    {
      id: "1",
      department_id: departmentId,
      parent_sku_code: "WKB-0002",
      component_sku_code: "N15-0002",
      work_center_id: "BIS01",
      issue_owner_department_id: departmentId,
      component_type: "RAW",
      dispatch_split_mode: "merge_all",
      usage_type: "DIRECT",
    },
    {
      id: "2",
      department_id: departmentId,
      parent_sku_code: "B01-1001",
      component_sku_code: "N15-0002",
      work_center_id: "BIS04",
      issue_owner_department_id: departmentId,
      component_type: "RAW",
      dispatch_split_mode: "merge_all",
      usage_type: "DIRECT",
    },
    {
      id: "3",
      department_id: departmentId,
      parent_sku_code: "BL0-1009",
      component_sku_code: "WKB-0050",
      work_center_id: "BIS01",
      issue_owner_department_id: departmentId,
      component_type: "WIP",
      dispatch_split_mode: "merge_all",
      usage_type: "DIRECT",
    },
  ];

  const routing = buildRequisitionRoutingMap(rows);

  assert.equal(routing.get(`${departmentId}|WKB-0002|N15-0002`)?.work_center_id, "BIS01");
  assert.equal(routing.get(`${departmentId}|B01-1001|N15-0002`)?.work_center_id, "BIS04");
  assert.equal(routing.has(`${departmentId}|*|N15-0002`), false);
  assert.equal(routing.get(`${departmentId}|*|WKB-0050`)?.work_center_id, "BIS01");
});

test("requisition routing loader includes active rows past the API's 1000-row cap", async () => {
  const { loadRequisitionRoutingRows, buildRequisitionRoutingMap } = await import("../src/lib/requisitionRouting.js");
  assert.equal(typeof loadRequisitionRoutingRows, "function");

  const departmentId = "KP13";
  const routingRows = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index + 1).padStart(4, "0"),
    department_id: departmentId,
    fg_sku_code: "B01-1013",
    parent_sku_code: "B01-1013",
    component_sku_code: index === 1000 ? "S01-0303" : `OTHER-${index}`,
    work_center_id: "BIS04",
    issue_owner_department_id: departmentId,
    component_type: "RAW",
    dispatch_split_mode: "merge_all",
    usage_type: "DIRECT",
    is_active: true,
    deleted_at: null,
  }));
  routingRows.push({ ...routingRows[0], id: "1002", department_id: "OTHER" });
  routingRows.push({ ...routingRows[0], id: "1003", is_active: false });

  const supabase = {
    from(table) {
      assert.equal(table, "production_routing_components");
      const filters = [];
      return {
        select() { return this; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return this; },
        eq(column, value) { filters.push((row) => row[column] === value); return this; },
        is(column, value) { filters.push((row) => row[column] === value); return this; },
        order() { return this; },
        async range(from, to) {
          const matching = routingRows.filter((row) => filters.every((filter) => filter(row)));
          return { data: matching.slice(from, Math.min(to + 1, from + 1000)), error: null };
        },
      };
    },
  };

  const loaded = await loadRequisitionRoutingRows(supabase, [departmentId]);
  const map = buildRequisitionRoutingMap(loaded);
  assert.equal(loaded.length, 1001);
  assert.equal(map.get(`${departmentId}|B01-1013|S01-0303`)?.work_center_id, "BIS04");
});

test("requisition routing ignores usage type when every route has the same effective destination", async () => {
  const { buildRequisitionRoutingMap } = await import("../src/lib/requisitionRouting.js");
  const shared = {
    department_id: "KP13",
    component_sku_code: "M01-0004",
    work_center_id: "SUG01",
    issue_owner_department_id: "KP17",
    component_type: "RAW",
    dispatch_split_mode: "merge_all",
  };
  const routing = buildRequisitionRoutingMap([
    { ...shared, id: "direct", parent_sku_code: "WKB-0041", usage_type: "DIRECT" },
    { ...shared, id: "process", parent_sku_code: "WKB-0002", usage_type: "PROCESS" },
  ]);

  assert.equal(routing.get("KP13|*|M01-0004")?.work_center_id, "SUG01");
});

test("direct WIP routing wins over conflicting FG-context routes for the same WIP material", async () => {
  const { buildRequisitionRoutingMap } = await import("../src/lib/requisitionRouting.js");
  const departmentId = "DEPT-1";
  const rows = [
    {
      id: "fg-1",
      department_id: departmentId,
      fg_sku_code: "BL0-5010",
      parent_sku_code: "WKB-0048",
      component_sku_code: "M01-0013",
      work_center_id: "BIS02",
      issue_owner_department_id: departmentId,
      component_type: "RAW",
      dispatch_split_mode: "merge_all",
      usage_type: "DIRECT",
    },
    {
      id: "wip-direct",
      department_id: departmentId,
      fg_sku_code: "WKB-0048",
      parent_sku_code: "WKB-0048",
      component_sku_code: "M01-0013",
      work_center_id: "BIS01",
      issue_owner_department_id: departmentId,
      component_type: "RAW",
      dispatch_split_mode: "split_by_material_type",
      usage_type: "DIRECT",
    },
    {
      id: "fg-2",
      department_id: departmentId,
      fg_sku_code: "B06-0005",
      parent_sku_code: "WKB-0048",
      component_sku_code: "M01-0013",
      work_center_id: "BIS01",
      issue_owner_department_id: departmentId,
      component_type: "RAW",
      dispatch_split_mode: "merge_all",
      usage_type: "DIRECT",
    },
  ];

  const routing = buildRequisitionRoutingMap(rows);

  assert.equal(
    routing.get(`${departmentId}|WKB-0048|M01-0013`)?.id,
    "wip-direct"
  );
  assert.equal(
    routing.get(`${departmentId}|WKB-0048|M01-0013`)?.work_center_id,
    "BIS01"
  );
});

test("preview and export share the conflict-safe requisition routing lookup", () => {
  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirm = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");

  for (const source of [preview, confirm]) {
    assert.match(source, /loadRequisitionRoutingRows\(/);
    assert.match(source, /buildRequisitionRoutingMap\(routingRows\)/);
    assert.doesNotMatch(source, /upsertRouting\(`\$\{dept\}\|\*\|\$\{compSku\}`/);
  }
});

test("Excel export errors render above the export modal", () => {
  const previewClient = readSource(
    "src/features/production-planning/components/RequisitionPreviewGeneratorClient.js"
  );

  assert.match(previewClient, /function ExportErrorPopup/);
  assert.match(previewClient, /z-\[400\]/);
  assert.match(previewClient, /role="alertdialog"/);
  assert.match(previewClient, /setExportErrorMessage\(message\)/);
  assert.match(previewClient, /<ExportErrorPopup/);
});

test("daily Excel export allows FIFO allocation up to available stock and reports shortages", () => {
  const confirmRoute = readSource(
    "src/app/api/production-planning/requisition/confirm-daily/route.js"
  );
  const previewClient = readSource(
    "src/features/production-planning/components/RequisitionPreviewGeneratorClient.js"
  );

  assert.match(confirmRoute, /allowPartialStock:\s*true/);
  assert.match(confirmRoute, /"X-Partial-Stock"/);
  assert.match(confirmRoute, /stockAllocationStatus: shortages\.length \? "partial" : "complete"/);
  assert.match(previewClient, /Export เท่าที่มีสำเร็จ/);
});

test("all requisition Excel routes export issue-purpose code 1", () => {
  const routes = [
    readSource("src/app/api/production-planning/requisition/export/route.js"),
    readSource("src/app/api/production-planning/requisition/confirm-daily/route.js"),
    readSource("src/app/api/production-planning/requisition/supplemental/export/route.js"),
  ];

  routes.forEach((source) => {
    assert.match(source, /"เบิกไปสำหรับ":\s*"1"/);
    assert.doesNotMatch(source, /"เบิกไปสำหรับ":\s*"2"/);
  });
});

test("preview keeps subplan WIP names even when the WIP itself has no room routing", () => {
  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");

  assert.match(preview, /workCenterId \|\| "UNASSIGNED_ROOM"/);
  assert.match(preview, /const subplanWipName = isSubplanRow\(planRow\)/);
  assert.doesNotMatch(preview, /routingByKey\.get\(`\$\{departmentId\}\|\*\|\$\{wipSku\}`\)/);
});

test("requisition documents split by FG category 04 and section, not by WIP parent SKU", async () => {
  const {
    buildRequisitionDocumentBaseKey,
    resolveRequisitionDocumentParent,
  } = await import("../src/lib/requisitionDocumentGrouping.js");

  const shared = {
    ownerDepartmentId: "OWNER-1",
    roomId: "ROOM-1",
    shiftCode: "SHIFT1",
    workstreamCode: "SECTION-JAM",
  };
  const fermentedDough = resolveRequisitionDocumentParent({
    skuCode: "WKB-0041",
    skuName: "แป้งหมัก",
    categoryCode: "03",
  });
  const crackerSheet = resolveRequisitionDocumentParent({
    skuCode: "WKB-0002",
    skuName: "แผ่นแครกเกอร์โบตั๋น",
    categoryCode: "03",
  });
  const fgA = resolveRequisitionDocumentParent({
    skuCode: "P18-0002-1",
    skuName: "FG A",
    categoryCode: "04",
  });
  const fgB = resolveRequisitionDocumentParent({
    skuCode: "P18-0003",
    skuName: "FG B",
    categoryCode: "04-1",
  });

  assert.deepEqual(fermentedDough, { parentSku: null, parentSkuName: null });
  assert.deepEqual(crackerSheet, { parentSku: null, parentSkuName: null });
  assert.equal(
    buildRequisitionDocumentBaseKey({ ...shared, ...fermentedDough }),
    buildRequisitionDocumentBaseKey({ ...shared, ...crackerSheet })
  );
  assert.notEqual(
    buildRequisitionDocumentBaseKey({ ...shared, ...fermentedDough }),
    buildRequisitionDocumentBaseKey({
      ...shared,
      workstreamCode: "SECTION-CREAM",
      ...fermentedDough,
    })
  );
  assert.notEqual(
    buildRequisitionDocumentBaseKey({ ...shared, ...fgA }),
    buildRequisitionDocumentBaseKey({ ...shared, ...fgB })
  );

  const preview = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirm = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");
  for (const source of [preview, confirm]) {
    assert.match(source, /loadRequisitionParentCategoryMap/);
    assert.match(source, /resolveRequisitionDocumentParent/);
    assert.match(source, /resolveRequisitionDocumentDiscriminator/);
    assert.match(source, /buildRequisitionDocumentBaseKey\(item\)/);
    assert.doesNotMatch(source, /item\.parentSku \|\| "UNASSIGNED_SKU"/);
  }
  assert.match(preview, /doc\.workstreamCode \|\| "DEFAULT"/);
  assert.match(confirm, /workstreamCode:\s*doc\.workstreamCode/);
});

test("subplan claim rows retain section metadata for WIP names and document grouping", () => {
  const source = readSource("src/lib/materialClaimPool.js");
  const subplanSource = source.slice(
    source.indexOf("export async function loadSubplanRowsForClaimDemand"),
    source.indexOf("export async function loadMainPlanRowsForClaimDemand")
  );
  assert.ok(
    (subplanSource.match(/schedule_section_def_id,schedule_section_name/g) || []).length >= 2,
    "both the primary and compatibility subplan queries must load section metadata"
  );
});

test("requisition preview drafts are scoped, versioned, and payload-limited", () => {
  const draftRoute = readSource("src/app/api/production-planning/requisition/draft/route.js");
  const accessHelper = readSource("src/lib/requisitionPreviewAccess.js");
  const previewClient = readSource(
    "src/features/production-planning/components/RequisitionPreviewGeneratorClient.js"
  );

  assert.match(accessHelper, /buildRequisitionDraftScopeKey/);
  assert.match(accessHelper, /DEPTS:/);
  assert.match(accessHelper, /GLOBAL/);
  assert.match(draftRoute, /MAX_DRAFT_BYTES/);
  assert.match(draftRoute, /MAX_DRAFT_DOCUMENTS/);
  assert.match(draftRoute, /MAX_LINES_PER_DOCUMENT/);
  assert.match(draftRoute, /baseUpdatedAt/);
  assert.match(draftRoute, /new ApiError\(409/);
  assert.match(previewClient, /baseUpdatedAt:\s*draftPayload\?\.data\?\.updatedAt/);
  assert.match(previewClient, /itemType:\s*String\(line\?\.itemType/);
});

test("requisition preview and export enforce department scope and chunk wide Supabase filters", () => {
  const previewRoute = readSource("src/app/api/production-planning/requisition/preview/route.js");
  const confirmRoute = readSource("src/app/api/production-planning/requisition/confirm-daily/route.js");
  const supplementalRoute = readSource("src/app/api/production-planning/requisition/supplemental/export/route.js");

  assert.match(previewRoute, /loadRequisitionAccessScope/);
  assert.match(previewRoute, /assertRequisitionDepartmentAccess/);
  assert.match(previewRoute, /canAccessRequisitionDepartment/);
  assert.match(confirmRoute, /assertRequisitionDepartmentAccess/);
  assert.match(confirmRoute, /loadScopedRequisitionDraftRow/);
  assert.match(confirmRoute, /fetchSupabaseRowsByChunks/);
  assert.doesNotMatch(confirmRoute, /\.eq\("master_plan_no", masterPlanNo\)\s*\.order\("updated_at"/);
  assert.match(supplementalRoute, /requireDocumentScope/);
  assert.match(supplementalRoute, /validateSupplementalMaterials/);
  assert.match(supplementalRoute, /assertRequisitionDepartmentAccess/);
});

test("merged requisition preview actions target every source document while cell edits remain source-specific", () => {
  const previewClient = readSource(
    "src/features/production-planning/components/RequisitionPreviewGeneratorClient.js"
  );

  assert.match(previewClient, /normalizeDocumentKeys/);
  assert.match(previewClient, /actionDocumentKeys/);
  assert.match(previewClient, /onResetDocument\(actionDocumentKeys\)/);
  assert.match(previewClient, /onOpenAddMaterial\(actionDocumentKeys\)/);
  assert.match(previewClient, /setHiddenDocKeys\(\(current\) => Array\.from\(new Set\(\[\.\.\.current, \.\.\.nextKeys\]\)\)\)/);
  assert.match(previewClient, /column\.sourceDocumentKey \|\| actionDocumentKey/);
  assert.match(previewClient, /sourceDocument\.parentSku/);
  assert.match(previewClient, /sourceDocument\.workstreamCode/);
});

test("requisition-only helper is not imported by departmental floor or material-claim modules", () => {
  const files = [];
  const walk = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(fullPath);
    });
  };
  walk(path.join(repoRoot, "src"));

  const importers = files
    .filter((file) => readSource(path.relative(repoRoot, file)).includes("requisitionMaterialPolicy"))
    .map((file) => path.relative(repoRoot, file).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(importers, [
    "src/app/api/production-planning/requisition/confirm-daily/route.js",
    "src/app/api/production-planning/requisition/preview/route.js",
  ]);
});
