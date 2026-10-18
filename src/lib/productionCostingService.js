import { getSupabaseAdmin, ApiError } from "./adminApi.js";
import { fetchGatewayJson } from "./gatewayClient.js";
import { fetchAllSupabaseRows } from "./supabaseRangeFetch.js";
import { explodeBomBatch } from "./bomExplosionRpc.js";
import { loadProductionInputOutputReportData } from "./production-input-output-data.js";
import { JAM_GOODS_CODES } from "./production-input-output-report.js";
import { resolvePieceRateReportMetrics } from "./pieceRateReportMetrics.js";
import {
  buildProductionOutputCandidates,
  attachOutputsToPlanRows,
  extractBomSnapshotMaterials,
  planMatchesRequisitionWorkstream,
  parseCostingLotDate,
  parseProductionLotDate,
  parseLotToDates,
  productionReceiptDateRange,
  calculateCostSheetTotals,
  validateCentralAllocation,
  validateCostSheetClose,
  applyMaterialIssueCostToReceipts,
  rawMaterialUnitCostExclVat,
  prefersActualWipIssueAllocation,
  resolveFlourSiftingProfile,
  resolveUpstreamCostSku,
  buildMaterialEstimateRows,
  buildInputOutputJamCostRows,
  allocateBiscuitSandwichShellAndJam,
  summarizePieceRateLabor,
} from "./productionCostingMath.js";
import {
  actualBomDemand,
  applyMaterialSkuLookup,
  allocateSharedIssuesByBom,
  collectGatewayCursorRows,
  excludePreviewDocumentsOwnedByOtherOutputs,
  filterActualRequisitionRows,
  isRequisitionDocumentNo,
  netIssueLinesByReturns,
  productionRequisitionFallbackDate,
  productionRequisitionLoadScopes,
  requisitionRemarkMatchesProductionDate,
  resolveAllocatedIssueUnitCost,
  selectBiscuitShellRequisitionDocuments,
  selectRequisitionDocuments,
  selectRoutedRequisitionDocuments,
  selectRequisitionPreviewGroup,
  selectRequisitionPreviewGroups,
  selectPreviewDocumentNosForOutput,
} from "./productionCostAllocation.js";

export { parseLotToDates, calculateCostSheetTotals };

function normalizedMaterialName(value) {
  return String(value || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function loadPieceRateLaborSummary(db, skuCode, lotNo, knownAliases = null) {
  let aliases = knownAliases;
  if (!aliases) {
    const [bySku, byGoods] = await Promise.all([
      db.from("pallet_trade_code_barcodes").select("goods_code,sku_code").eq("sku_code", skuCode),
      db.from("pallet_trade_code_barcodes").select("goods_code,sku_code").eq("goods_code", skuCode),
    ]);
    if (bySku.error) throw new ApiError(500, bySku.error.message);
    if (byGoods.error) throw new ApiError(500, byGoods.error.message);
    aliases = new Set([skuCode]);
    [...(bySku.data || []), ...(byGoods.data || [])].forEach((row) => {
      aliases.add(row.sku_code);
      aliases.add(row.goods_code);
    });
  }
  const rows = await fetchAllSupabaseRows(() => db.from("production_piece_rate_logs")
    .select("doc_no,employee_code,lot_no,product_sku_code_snapshot,product_code_snapshot,product_goods_code_snapshot,wage_amount_snapshot,doc_status,replaced_by_log_id")
    .eq("lot_no", lotNo)
    .or("doc_status.eq.active,doc_status.is.null")
    .is("replaced_by_log_id", null)
    .order("id"));
  return summarizePieceRateLabor(rows, { aliases: [...aliases], lotNo });
}

function snapshotVersionId(row) {
  const snapshots = Array.isArray(row?.bom_snapshot) ? row.bom_snapshot : [];
  return row?.bom_version_id || snapshots[0]?.bomVersionId || null;
}

function dateDaysBefore(value, days = 1) {
  const dateValue = new Date(`${value}T00:00:00Z`);
  dateValue.setUTCDate(dateValue.getUTCDate() - days);
  return dateValue.toISOString().slice(0, 10);
}

function previousDate(value) {
  return dateDaysBefore(value);
}

async function loadRequisitionRowsForProductionDate(productionDate, preferredDocumentNos = []) {
  const documentRefs = [...new Set(preferredDocumentNos.map((value) => String(value || "").trim()).filter(isRequisitionDocumentNo))];
  if (documentRefs.length) {
    const results = await Promise.all(documentRefs.map(async (ref) => {
      const result = await fetchGatewayJson(
        "/api/raw-material-requisitions-by-ref",
        new URLSearchParams({ ref }),
        "production"
      );
      if (!result.ok) throw new ApiError(result.status || 502, result.error?.message || "โหลดใบเบิก ERP ไม่สำเร็จ");
      return result.data?.data || [];
    }));
    return results.flat();
  }
  const results = await Promise.all(productionRequisitionLoadScopes(productionDate, preferredDocumentNos).map((scope) => (
    collectGatewayCursorRows(async (cursor) => {
      const params = new URLSearchParams({
        pageSize: "500",
      });
      Object.entries(scope).forEach(([key, value]) => params.set(key, value));
      if (cursor) params.set("cursor", cursor);
      const result = await fetchGatewayJson("/api/raw-material-requisitions", params, "production");
      if (!result.ok) throw new ApiError(result.status || 502, result.error?.message || "โหลดใบเบิก ERP ไม่สำเร็จ");
      return {
        rows: result.data?.data || [],
        hasMore: Boolean(result.data?.cursor?.hasMore),
        nextCursor: result.data?.cursor?.next || null,
      };
    })
  )));
  return results.flat();
}

function thaiPlanDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${String(Number(year) + 543).slice(-2)}` : "";
}

function roomSearchText(value) {
  return String(value || "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^ห้อง/, "")
    .trim();
}

async function loadCurrentSkuByGoods(goodsCodes) {
  const results = await Promise.all([...new Set(goodsCodes.filter(Boolean))].map((goodsCode) => fetchGatewayJson(
    "/api/trade-codes",
    new URLSearchParams({ search: goodsCode, pageSize: "20" }),
    "production"
  )));
  return new Map(results.flatMap((result) => result.ok ? result.data?.data || [] : [])
    .map((row) => [
      String(row.GOODS_CODE || row.goods_code || "").trim().toUpperCase(),
      String(row.SKU_CODE || row.sku_code || "").trim().toUpperCase(),
    ])
    .filter(([goodsCode, skuCode]) => goodsCode && skuCode));
}

async function loadRawMaterialLotCostMap(rows) {
  const keys = [...new Map(rows
    .filter((row) => row.itemType !== "WIP" && row.lotNo && (row.sourceMaterialSkuCode || row.materialSkuCode))
    .map((row) => {
      const skuCode = row.sourceMaterialSkuCode || row.materialSkuCode;
      return [`${skuCode}|${row.lotNo}`, { skuCode, lotNo: row.lotNo }];
    })).values()];
  const results = await Promise.all(keys.map(({ skuCode, lotNo }) => fetchGatewayJson(
    "/api/raw-material-lot-costs",
    new URLSearchParams({ search: lotNo, skuCode, lotNo, pageSize: "200", costSchema: "1" }),
    "production"
  )));
  const failed = results.find((result) => !result.ok);
  if (failed) throw new ApiError(failed.status || 502, failed.error?.message || "โหลดต้นทุน RM ตาม LOT ไม่สำเร็จ");
  return new Map(results.flatMap((result) => result.data?.data || [])
    .filter((row) => row.COST_STATUS === "ready")
    .map((row) => [`${row.SKU_CODE}|${String(row.LOT_NO || "").trim()}`, row]));
}

async function loadActualRequisitionEvidence({ productionDate, groupRows, groupItems }) {
  const previewDocuments = [...new Set(groupRows
    .map((row) => String(row.document_no || "").trim())
    .filter(Boolean))];
  const rows = filterActualRequisitionRows({
    rows: await loadRequisitionRowsForProductionDate(productionDate, previewDocuments),
    productionDate,
    preferredDocumentNos: previewDocuments,
  });
  const wantedCodes = (groupItems || []).map((row) => String(row.material_goods_code || "").trim()).filter(Boolean);
  const roomTerms = groupRows.map((row) => roomSearchText(row.metadata?.roomLabel)).filter(Boolean);
  const selected = selectRequisitionDocuments({
    rows,
    wantedCodes,
    roomTerms,
    preferredDocumentNos: previewDocuments,
  });
  const documents = selected.map(([documentNo]) => documentNo);
  const issueRows = selected.flatMap(([, documentRows]) => documentRows);
  if (!documents.length) throw new ApiError(404, `ไม่พบใบเบิกจริงที่อ้างถึงแผนผลิต ${thaiPlanDate(productionDate)}`);

  const returnDateFrom = dateDaysBefore(productionDate, 7);
  const returnDateTo = dateDaysBefore(productionDate, -7);
  const returnParams = new URLSearchParams({
    issueRefs: documents.join("|"),
    dateFrom: returnDateFrom,
    dateTo: returnDateTo,
    pageSize: "500",
    includeTotal: "false",
  });
  const returnResult = await fetchGatewayJson("/api/raw-material-returns", returnParams, "production");
  if (!returnResult.ok) throw new ApiError(returnResult.status || 502, returnResult.error?.message || "โหลดใบคืน ERP ไม่สำเร็จ");
  return {
    previewDocuments,
    documents,
    issueRows,
    returnRows: returnResult.data?.data || [],
  };
}

export async function buildBomAllocationPreview({ masterPlanNo, productionDate, skuCode, context = {} }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(productionDate || "")) || !skuCode) {
    throw new ApiError(400, "productionDate and skuCode are required");
  }

  const cacheKey = `${masterPlanNo || ""}|${productionDate}|${skuCode}`;
  return memoizedRequest(context, "bomAllocationPreviews", cacheKey, async () => {
  const db = getSupabaseAdmin();
  let resolvedMasterPlanNo = String(masterPlanNo || "").trim();
  if (!resolvedMasterPlanNo) {
    const { data: matches, error: matchError } = await db
      .from("production_plan_status")
      .select("master_plan_no")
      .eq("period_start", productionDate)
      .eq("sku_code", skuCode);
    if (matchError) throw new ApiError(500, matchError.message);
    const plans = [...new Set((matches || []).map((row) => row.master_plan_no).filter(Boolean))];
    if (plans.length === 1) resolvedMasterPlanNo = plans[0];
    else {
      const fallbackDate = previousDate(productionDate);
      const { data: groups, error: groupsError } = await db.from("production_requisition_group_batches")
        .select("master_plan_no,metadata")
        .in("metadata->>selectedDate", [productionDate, fallbackDate])
        .eq("status", "exported");
      if (groupsError) throw new ApiError(500, groupsError.message);
      const matchedGroup = selectRequisitionPreviewGroup({
        groups,
        skuCode,
        productionDate,
        fallbackDate,
      });
      const groupPlans = matchedGroup?.master_plan_no ? [matchedGroup.master_plan_no] : [];
      if (groupPlans.length !== 1) {
        throw new ApiError(409, plans.length || groupPlans.length ? "พบสินค้านี้มากกว่าหนึ่งแผนหลัก กรุณาเลือกเลขแผน" : "ไม่พบแผนหลักหรือกลุ่มใบเบิกของสินค้าและวันที่นี้");
      }
      resolvedMasterPlanNo = groupPlans[0];
    }
  }
  const { data: planRows, error: planError } = await db
    .from("production_plan_status")
    .select("plan_id,sku_code,sku_name,planned_qty,unit,bom_version_id,bom_snapshot,owner_department_id,period_start,schedule_section_name")
    .eq("master_plan_no", resolvedMasterPlanNo)
    .eq("period_start", productionDate);
  if (planError) throw new ApiError(500, planError.message);

  const targetPlan = (planRows || []).find((row) => row.sku_code === skuCode);

  const { data: allGroups, error: groupError } = await db
    .from("production_requisition_group_batches")
    .select("id,document_no,master_plan_no,status,metadata")
    .eq("master_plan_no", resolvedMasterPlanNo)
    .eq("status", "exported");
  if (groupError) throw new ApiError(500, groupError.message);

  const planGroups = targetPlan ? (allGroups || [])
    .filter((group) => group.metadata?.selectedDate === productionDate
      && planMatchesRequisitionWorkstream(targetPlan, group.metadata))
    .sort((left, right) => Number(left.metadata?.roomId === "UNASSIGNED_ROOM") - Number(right.metadata?.roomId === "UNASSIGNED_ROOM")) : [];
  const exactGroups = selectRequisitionPreviewGroups({
    groups: allGroups,
    skuCode,
    productionDate,
    fallbackDate: previousDate(productionDate),
  });
  const targetGroup = exactGroups[0] || planGroups[0];
  if (!targetGroup) throw new ApiError(404, "ไม่พบกลุ่มใบเบิกที่ผูกกับแผนและห้องผลิตนี้");

  const metadata = targetGroup.metadata || {};
  const groupRows = metadata.parentSku === skuCode ? exactGroups.filter((group) => (
    group.metadata?.roomId === metadata.roomId
    && group.metadata?.workstreamCode === metadata.workstreamCode
    && group.metadata?.ownerDepartmentId === metadata.ownerDepartmentId
  )) : (allGroups || []).filter((group) => (
    group.metadata?.selectedDate === productionDate
    && group.metadata?.workstreamCode === metadata.workstreamCode
    && group.metadata?.roomId === metadata.roomId
    && group.metadata?.ownerDepartmentId === metadata.ownerDepartmentId
  ));
  const products = targetPlan ? (planRows || []).filter((row) => (
    row.owner_department_id === targetPlan.owner_department_id
    && planMatchesRequisitionWorkstream(row, metadata)
  )) : [];
  if (targetPlan && products.some((row) => !extractBomSnapshotMaterials(row.bom_snapshot).length)) {
    throw new ApiError(409, "มีแผนย่อยที่ไม่มี BOM snapshot จึงยังจัดสรรต้นทุนไม่ได้");
  }

  const groupIds = groupRows.map((row) => row.id);
  const { data: groupItems, error: itemError } = await db
    .from("production_requisition_group_items")
    .select("group_id,material_sku_code,material_goods_code,issue_qty,required_qty,metadata")
    .in("group_id", groupIds);
  if (itemError) throw new ApiError(500, itemError.message);

  const allocationProducts = targetPlan ? products.map((product) => ({
    productCode: product.sku_code,
    productName: product.sku_name,
    plannedQty: product.planned_qty,
    materials: extractBomSnapshotMaterials(product.bom_snapshot).map((item) => ({
      materialSkuCode: item.skuCode,
      materialCode: item.goodsCode || item.skuCode,
      materialName: item.name,
      requiredQty: item.requiredQty,
      uomName: item.uomName,
      itemType: item.itemType === "WIP" ? "WIP" : "RM",
    })),
  })) : [{
    productCode: skuCode,
    productName: metadata.parentSkuName || skuCode,
    plannedQty: 0,
    materials: (groupItems || []).map((item) => ({
      materialSkuCode: item.material_sku_code,
      materialCode: item.material_goods_code,
      materialName: item.metadata?.materialName,
      requiredQty: item.required_qty || item.issue_qty,
      uomName: item.metadata?.unit,
      itemType: item.metadata?.itemType === "WIP" ? "WIP" : "RM",
    })),
  }];

  const skuByGoods = new Map((groupItems || []).map((row) => [row.material_goods_code, row.material_sku_code]));
  const evidence = await loadActualRequisitionEvidence({
    productionDate: metadata.selectedDate || productionDate,
    groupRows,
    groupItems,
  });
  const documents = evidence.documents;
  let grossIssueLines = evidence.issueRows
    .map((row) => ({
      materialCode: row.TRD_SH_CODE,
      materialSkuCode: skuByGoods.get(row.TRD_SH_CODE),
      materialName: row.TRD_SH_NAME,
      issueQty: row.TRD_SH_QTY,
      packSize: row.TRD_UTQQTY,
      uomName: row.TRD_UTQNAME,
      lotNo: row.TRD_LOT_NO,
      sourceDocRef: row.DI_REF,
      sourceDocDate: String(row.DI_DATE || "").slice(0, 10) || null,
      itemType: ["03", "04", "04-1", "04-2"].includes(String(row.ICCAT_CODE || "")) ? "WIP" : "RM",
    }));
  const issueGoodsCodes = [...new Set(grossIssueLines.map((row) => row.materialCode).filter(Boolean))];
  const currentSkuByGoods = await loadCurrentSkuByGoods(issueGoodsCodes);
  grossIssueLines = applyMaterialSkuLookup(grossIssueLines, currentSkuByGoods);
  const returnLines = evidence.returnRows
    .filter((row) => documents.includes(String(row.TRD_REFER_REF || "").trim()) && Number(row.DI_ACTIVE) === 0)
    .map((row) => ({
      materialCode: row.TRD_SH_CODE,
      lotNo: row.TRD_LOT_NO,
      returnQty: row.TRD_SH_QTY,
      sourceDocRef: row.TRD_REFER_REF,
      returnDocRef: row.DI_REF,
    }));
  const netIssues = netIssueLinesByReturns({ issueLines: grossIssueLines, returnLines });
  const issueLines = netIssues.issueLines;

  const bomSkuByName = new Map();
  allocationProducts.flatMap((product) => product.materials).forEach((item) => {
    const name = normalizedMaterialName(item.materialName);
    if (!name) return;
    if (!bomSkuByName.has(name)) bomSkuByName.set(name, new Set());
    bomSkuByName.get(name).add(item.materialSkuCode);
  });
  const materialAliases = {};
  const aliasWarnings = [];
  issueLines.forEach((line) => {
    const name = normalizedMaterialName(line.materialName);
    const candidates = [...(bomSkuByName.get(name) || [])];
    if (line.materialSkuCode && candidates.length === 1 && candidates[0] !== line.materialSkuCode) {
      materialAliases[line.materialSkuCode] = candidates[0];
      aliasWarnings.push(`${line.materialSkuCode} → ${candidates[0]} (${line.materialName})`);
    }
  });
  issueLines.filter((line) => line.itemType === "WIP" && line.materialSkuCode && !materialAliases[line.materialSkuCode]).forEach((line) => {
    const candidates = [...new Set(allocationProducts.flatMap((product) => product.materials)
      .filter((item) => item.itemType === "WIP" && normalizedMaterialName(item.uomName) === normalizedMaterialName(line.uomName))
      .map((item) => item.materialSkuCode))];
    if (candidates.length === 1 && candidates[0] !== line.materialSkuCode) {
      materialAliases[line.materialSkuCode] = candidates[0];
      aliasWarnings.push(`${line.materialSkuCode} → ${candidates[0]} (WIP หน่วยบรรจุเดียวกัน; ต้องตรวจยืนยัน)`);
    }
  });

  const result = allocateSharedIssuesByBom({ products: allocationProducts, issueLines, materialAliases });
  const costEvidenceRows = [...result.allocations, ...result.unmatchedIssues];
  const rmCostByKey = await loadRawMaterialLotCostMap(costEvidenceRows);
  const upstreamKeys = [...new Set(costEvidenceRows
    .filter((row) => row.itemType === "WIP" && row.materialSkuCode && row.lotNo)
    .map((row) => `${row.materialSkuCode}|${row.lotNo}`))];
  let upstreamByKey = new Map();
  if (upstreamKeys.length) {
    const { data: upstreamSheets, error: upstreamError } = await db
      .from("production_cost_sheets")
      .select("id,cost_no,sku_code,lot_no,status,unit_cost,uom_name")
      .in("sku_code", [...new Set(upstreamKeys.map((key) => key.split("|")[0]))])
      .in("lot_no", [...new Set(upstreamKeys.map((key) => key.split("|")[1]))]);
    if (upstreamError) throw new ApiError(500, upstreamError.message);
    upstreamByKey = new Map((upstreamSheets || []).map((row) => [`${row.sku_code}|${row.lot_no}`, row]));
  }
  result.allocations = result.allocations.map((row) => {
    const upstream = upstreamByKey.get(`${row.materialSkuCode}|${row.lotNo}`);
    if (upstream) return {
      ...row,
      linkedCostSheet: upstream,
      costQty: row.allocatedBaseQty,
      costUomName: upstream.uom_name,
      unitCost: upstream.status === "closed" ? Number(upstream.unit_cost || 0) : null,
    };
    const rmCost = rmCostByKey.get(`${row.sourceMaterialSkuCode || row.materialSkuCode}|${row.lotNo}`);
    return rmCost ? {
      ...row,
      costQty: row.allocatedBaseQty,
      costUomName: rmCost.BASE_UNIT_NAME,
      unitCost: rawMaterialUnitCostExclVat(rmCost),
      costSourceRef: rmCost.LATEST_SOURCE_REF,
    } : { ...row, costQty: row.allocatedBaseQty, costUomName: "หน่วยหลัก", unitCost: null };
  });
  result.unmatchedIssues = result.unmatchedIssues.map((row) => {
    const upstream = upstreamByKey.get(`${row.materialSkuCode}|${row.lotNo}`);
    if (upstream) return {
      ...row,
      linkedCostSheet: upstream,
      costQty: row.issueBaseQty,
      costUomName: upstream.uom_name,
      unitCost: upstream.status === "closed" ? Number(upstream.unit_cost || 0) : null,
    };
    const rmCost = rmCostByKey.get(`${row.sourceMaterialSkuCode || row.materialSkuCode}|${row.lotNo}`);
    return rmCost ? {
      ...row,
      costQty: row.issueBaseQty,
      costUomName: rmCost.BASE_UNIT_NAME,
      unitCost: rawMaterialUnitCostExclVat(rmCost),
      costSourceRef: rmCost.LATEST_SOURCE_REF,
    } : { ...row, costQty: row.issueBaseQty, costUomName: "หน่วยหลัก", unitCost: null };
  });
  const hasReturnError = netIssues.unmatchedReturns.length > 0
    || netIssues.reconciliation.some((row) => row.status !== "balanced");
  const hasAllocationError = result.missingIssues.length > 0 || result.unmatchedIssues.length > 0
    || result.reconciliation.some((row) => Math.abs(row.allocationVarianceBaseQty) > 0.000001);
  return {
    ...result,
    targetProductCode: skuCode,
    masterPlanNo: resolvedMasterPlanNo,
    products: allocationProducts.map(({ materials, ...product }) => ({ ...product, materialCount: materials.length })),
    previewDocuments: evidence.previewDocuments,
    documents,
    returnDocuments: [...new Set(returnLines.map((row) => row.returnDocRef).filter(Boolean))],
    issueReturnReconciliation: netIssues.reconciliation,
    zeroUseIssues: netIssues.zeroUseLines,
    canConfirm: !hasReturnError && !hasAllocationError,
    aliases: aliasWarnings,
    generatedAt: new Date().toISOString(),
  };
  });
}

export async function listProductionCostCandidates({ dateFrom, dateTo }) {
  const db = getSupabaseAdmin();
  const rangeStart = new Date(`${dateFrom}T00:00:00+07:00`).toISOString();
  const rangeEnd = new Date(new Date(`${dateTo}T00:00:00+07:00`).getTime() + 86400000).toISOString();
  const weightSelect = "id,product_config_id,lot_id,net_weight_kg,weighed_at,metadata";
  const logSelect = "id,doc_no,lot_no,actual_weighed_at,product_sku_code_snapshot,product_code_snapshot,product_name_snapshot,product_unit_snapshot,input_mode_snapshot,input_value,count_value_snapshot,weight_kg_snapshot,kg_per_pail_snapshot,normalized_kg_amount_snapshot";
  const [datedWeights, datedLogs] = await Promise.all([
    fetchAllSupabaseRows(() => db.from("production_weight_receipts").select(weightSelect).eq("status", "recorded").gte("weighed_at", rangeStart).lt("weighed_at", rangeEnd).order("id")),
    fetchAllSupabaseRows(() => db.from("production_piece_rate_logs").select(logSelect).or("doc_status.eq.active,doc_status.is.null").is("replaced_by_log_id", null).gte("actual_weighed_at", rangeStart).lt("actual_weighed_at", rangeEnd).order("id")),
  ]);
  const configIds = [...new Set(datedWeights.map((row) => row.product_config_id).filter(Boolean))];
  const lotIds = [...new Set(datedWeights.map((row) => row.lot_id).filter(Boolean))];
  const lotNos = [...new Set(datedLogs.map((row) => row.lot_no).filter(Boolean))];
  const [configs, lots, weights, logs] = await Promise.all([
    configIds.length ? fetchAllSupabaseRows(() => db.from("production_weight_scale_products").select("id,sku_code").in("id", configIds).order("id")) : [],
    lotIds.length ? fetchAllSupabaseRows(() => db.from("production_weight_scale_lots").select("id,lot_code").in("id", lotIds).order("id")) : [],
    configIds.length && lotIds.length ? fetchAllSupabaseRows(() => db.from("production_weight_receipts").select(weightSelect).eq("status", "recorded").in("product_config_id", configIds).in("lot_id", lotIds).order("id")) : [],
    lotNos.length ? fetchAllSupabaseRows(() => db.from("production_piece_rate_logs").select(logSelect).or("doc_status.eq.active,doc_status.is.null").is("replaced_by_log_id", null).in("lot_no", lotNos).order("id")) : [],
  ]);
  const skuCodes = [...new Set([
    ...configs.map((row) => row.sku_code),
    ...logs.flatMap((row) => [row.product_sku_code_snapshot, row.product_code_snapshot]),
  ].filter(Boolean))];
  const [products, sheets] = await Promise.all([
    skuCodes.length ? fetchAllSupabaseRows(() => db.from("products_cache").select("sku_code,sku_name,iccat_code,image_url").in("sku_code", skuCodes).order("sku_code")) : [],
    skuCodes.length ? fetchAllSupabaseRows(() => db.from("production_cost_sheets").select("id,cost_no,cost_type,production_date,sku_code,lot_no,status").in("sku_code", skuCodes).order("id")) : [],
  ]);
  const configMap = new Map(configs.map(r => [r.id, r.sku_code]));
  const lotMap = new Map(lots.map(r => [r.id, r.lot_code]));
  const productMap = new Map(products.map(r => [r.sku_code, r]));
  const date = value => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
  const receipts = weights.filter(r => !r.metadata?.isReturn).map(r => ({
    id: `weight:${r.id}`, skuCode: configMap.get(r.product_config_id), lotNo: lotMap.get(r.lot_id),
    actualQty: r.net_weight_kg, actualWeightKg: r.net_weight_kg, productionDate: date(r.weighed_at), source: "ใบชั่งรับผลผลิต", uomName: "kg",
  })).concat(logs.map((r) => {
    const metrics = resolvePieceRateReportMetrics(r);
    const unit = String(r.product_unit_snapshot || "").trim().toUpperCase();
    const isKgUnit = unit === "KG" || unit === "กก." || unit === "กิโลกรัม";
    const productInfo = productMap.get(r.product_sku_code_snapshot || r.product_code_snapshot);
    const isWipProduct = productInfo ? !["04", "04-1", "04-2"].includes(productInfo.iccat_code) : false;
    const shouldUseKg = isKgUnit || isWipProduct;
    return {
      id: `piece:${r.id}`, skuCode: r.product_sku_code_snapshot || r.product_code_snapshot,
      skuName: r.product_name_snapshot, lotNo: r.lot_no, actualQty: shouldUseKg ? metrics.normalizedKgAmount : metrics.countValue,
      actualWeightKg: metrics.normalizedKgAmount, uomName: shouldUseKg ? (r.product_unit_snapshot || "kg") : (r.product_unit_snapshot || "ชิ้น"),
      productionDate: date(r.actual_weighed_at), source: `รับเข้าป้ายแยม ${r.doc_no}`,
    };
  })).map(r => ({ ...r, skuName: r.skuName || productMap.get(r.skuCode)?.sku_name || r.skuCode,
    imageUrl: productMap.get(r.skuCode)?.image_url || null,
    costType: ["04", "04-1", "04-2"].includes(productMap.get(r.skuCode)?.iccat_code) ? "FG" : "WIP",
    uomName: r.uomName || "kg" }));
  return { data: buildProductionOutputCandidates(receipts, sheets).filter(r => r.receiptDates.some(d => d >= dateFrom && d <= dateTo)),
    warnings: [], generatedAt: new Date().toISOString() };
}

async function listProductionCostCandidatesForPlanRows(planRows) {
  const db = getSupabaseAdmin();
  const codes = [...new Set(planRows.map((row) => row.sku_code).filter(Boolean))];
  if (!codes.length) return [];
  const lotPrefixes = [...new Set(planRows.map((row) => {
    const [year, month, day] = String(row.period_start || "").slice(0, 10).split("-");
    return year && month && day ? `${day}${month}${year.slice(-2)}` : null;
  }).filter(Boolean))];
  const lotFilter = lotPrefixes.map((prefix) => `lot_code.like.${prefix}%`).join(",");
  const pieceLotFilter = lotPrefixes.map((prefix) => `lot_no.like.${prefix}%`).join(",");
  const [configs, products, sheets, logsBySku, logsByCode, lots] = await Promise.all([
    fetchAllSupabaseRows(() => db.from("production_weight_scale_products").select("id,sku_code").in("sku_code", codes).order("id")),
    fetchAllSupabaseRows(() => db.from("products_cache").select("sku_code,sku_name,iccat_code").in("sku_code", codes).order("sku_code")),
    fetchAllSupabaseRows(() => db.from("production_cost_sheets").select("id,cost_no,cost_type,production_date,sku_code,lot_no,status").in("sku_code", codes).order("id")),
    fetchAllSupabaseRows(() => db.from("production_piece_rate_logs").select("id,doc_no,lot_no,actual_weighed_at,product_sku_code_snapshot,product_code_snapshot,product_name_snapshot,product_unit_snapshot,input_mode_snapshot,input_value,count_value_snapshot,weight_kg_snapshot,kg_per_pail_snapshot,normalized_kg_amount_snapshot").in("product_sku_code_snapshot", codes).or(pieceLotFilter).or("doc_status.eq.active,doc_status.is.null").is("replaced_by_log_id", null).not("actual_weighed_at", "is", null).order("id")),
    fetchAllSupabaseRows(() => db.from("production_piece_rate_logs").select("id,doc_no,lot_no,actual_weighed_at,product_sku_code_snapshot,product_code_snapshot,product_name_snapshot,product_unit_snapshot,input_mode_snapshot,input_value,count_value_snapshot,weight_kg_snapshot,kg_per_pail_snapshot,normalized_kg_amount_snapshot").in("product_code_snapshot", codes).or(pieceLotFilter).or("doc_status.eq.active,doc_status.is.null").is("replaced_by_log_id", null).not("actual_weighed_at", "is", null).order("id")),
    fetchAllSupabaseRows(() => db.from("production_weight_scale_lots").select("id,lot_code").or(lotFilter).order("id")),
  ]);
  const configIds = configs.map((row) => row.id);
  const lotIds = lots.map((row) => row.id);
  const weights = configIds.length && lotIds.length
    ? await fetchAllSupabaseRows(() => db.from("production_weight_receipts").select("id,product_config_id,lot_id,net_weight_kg,weighed_at,metadata").in("product_config_id", configIds).in("lot_id", lotIds).eq("status", "recorded").order("id"))
    : [];
  const configMap = new Map(configs.map((row) => [row.id, row.sku_code]));
  const lotMap = new Map(lots.map((row) => [row.id, row.lot_code]));
  const productMap = new Map(products.map((row) => [row.sku_code, row]));
  const pieceLogs = [...new Map([...logsBySku, ...logsByCode].map((row) => [row.id, row])).values()];
  const date = (value) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
  const receipts = weights.filter((row) => !row.metadata?.isReturn).map((row) => ({
    id: `weight:${row.id}`,
    skuCode: configMap.get(row.product_config_id),
    lotNo: lotMap.get(row.lot_id),
    actualQty: row.net_weight_kg,
    actualWeightKg: row.net_weight_kg,
    uomName: "kg",
    productionDate: date(row.weighed_at),
    source: "ใบชั่งรับผลผลิต",
  })).concat(pieceLogs.map((row) => {
    const metrics = resolvePieceRateReportMetrics(row);
    const unit = String(row.product_unit_snapshot || "").trim().toUpperCase();
    const isKgUnit = unit === "KG" || unit === "กก." || unit === "กิโลกรัม";
    const productInfo = productMap.get(row.product_sku_code_snapshot || row.product_code_snapshot);
    const isWipProduct = productInfo ? !["04", "04-1", "04-2"].includes(productInfo.iccat_code) : false;
    const shouldUseKg = isKgUnit || isWipProduct;
    return {
      id: `piece:${row.id}`,
      skuCode: row.product_sku_code_snapshot || row.product_code_snapshot,
      skuName: row.product_name_snapshot,
      lotNo: row.lot_no,
      actualQty: shouldUseKg ? metrics.normalizedKgAmount : metrics.countValue,
      actualWeightKg: metrics.normalizedKgAmount,
      uomName: shouldUseKg ? (row.product_unit_snapshot || "kg") : (row.product_unit_snapshot || "ชิ้น"),
      productionDate: date(row.actual_weighed_at),
      source: `รับเข้าป้ายแยม ${row.doc_no}`,
    };
  })).map((row) => ({
    ...row,
    skuName: row.skuName || productMap.get(row.skuCode)?.sku_name || row.skuCode,
    costType: ["04", "04-1", "04-2"].includes(productMap.get(row.skuCode)?.iccat_code) ? "FG" : "WIP",
    uomName: row.uomName || "kg",
  }));
  return buildProductionOutputCandidates(receipts, sheets);
}

export async function listCostingMasterPlans() {
  const db = getSupabaseAdmin();
  const [scheduleRows, planRows, sheets] = await Promise.all([
    fetchAllSupabaseRows(() => db.from("production_schedule_plans")
      .select("master_plan_no,week_start_date,period_end,status")
      .not("master_plan_no", "is", null)
      .order("week_start_date", { ascending: false })),
    fetchAllSupabaseRows(() => db.from("production_plan_status")
      .select("master_plan_no,period_start")
      .not("master_plan_no", "is", null)
      .order("period_start", { ascending: false })),
    fetchAllSupabaseRows(() => db.from("production_cost_sheets")
      .select("master_plan_no,status")
      .not("master_plan_no", "is", null)),
  ]);
  const map = new Map();
  [...scheduleRows, ...planRows].forEach((row) => {
    const masterPlanNo = String(row.master_plan_no || "").trim().toUpperCase();
    if (!masterPlanNo) return;
    const start = String(row.week_start_date || row.period_start || "").slice(0, 10) || null;
    const end = String(row.period_end || row.period_start || "").slice(0, 10) || start;
    const current = map.get(masterPlanNo) || { masterPlanNo, periodStart: start, periodEnd: end, sheetCount: 0, closedCount: 0 };
    if (start && (!current.periodStart || start < current.periodStart)) current.periodStart = start;
    if (end && (!current.periodEnd || end > current.periodEnd)) current.periodEnd = end;
    map.set(masterPlanNo, current);
  });
  sheets.forEach((sheet) => {
    const row = map.get(String(sheet.master_plan_no || "").trim().toUpperCase());
    if (!row) return;
    row.sheetCount += 1;
    if (sheet.status === "closed") row.closedCount += 1;
  });
  return [...map.values()].sort((a, b) => String(b.periodStart || "").localeCompare(String(a.periodStart || "")));
}

export async function getCostingMasterPlanOverview(masterPlanNo) {
  const normalizedPlanNo = String(masterPlanNo || "").trim().toUpperCase();
  if (!normalizedPlanNo) throw new ApiError(400, "masterPlanNo is required");
  const db = getSupabaseAdmin();
  const { data: planRows, error: planError } = await db
    .from("production_plan_status")
    .select("plan_id,plan_kind,sub_plan_no,owner_department_id,sku_code,sku_name,planned_qty,unit,period_start,status,bom_version_id,bom_snapshot,schedule_section_name")
    .eq("master_plan_no", normalizedPlanNo)
    .order("period_start", { ascending: true })
    .order("sku_code", { ascending: true });
  if (planError) throw new ApiError(500, planError.message);
  if (!planRows?.length) throw new ApiError(404, "ไม่พบรายละเอียดของแผนหลักนี้");

  const departmentIds = [...new Set(planRows.map((row) => row.owner_department_id).filter(Boolean))];
  const [{ data: departments, error: departmentError }, candidates] = await Promise.all([
    departmentIds.length
      ? db.from("production_departments").select("id,code,name").in("id", departmentIds)
      : Promise.resolve({ data: [], error: null }),
    listProductionCostCandidatesForPlanRows(planRows),
  ]);
  if (departmentError) throw new ApiError(500, departmentError.message);
  const departmentById = new Map((departments || []).map((row) => [row.id, row]));
  const normalizedRows = planRows.map((row) => {
    const department = departmentById.get(row.owner_department_id) || {};
    return {
      planId: row.plan_id,
      planKind: row.plan_kind,
      subPlanNo: row.sub_plan_no,
      productionDate: String(row.period_start || "").slice(0, 10),
      departmentId: row.owner_department_id,
      departmentCode: department.code || null,
      departmentName: department.name || null,
      sectionName: row.schedule_section_name || null,
      skuCode: row.sku_code,
      skuName: row.sku_name,
      plannedQty: Number(row.planned_qty || 0),
      plannedUom: row.unit,
      planStatus: row.status,
      bomVersionId: snapshotVersionId(row),
      hasBomSnapshot: Array.isArray(row.bom_snapshot) && row.bom_snapshot.length > 0,
      bomMaterials: extractBomSnapshotMaterials(row.bom_snapshot),
    };
  });
  const rows = attachOutputsToPlanRows(normalizedRows, candidates);
  const outputCount = rows.reduce((sum, row) => sum + row.outputs.length, 0);
  const sheetCount = rows.reduce((sum, row) => sum + row.outputs.filter((output) => output.existingSheet).length, 0);
  const closedCount = rows.reduce((sum, row) => sum + row.outputs.filter((output) => output.existingSheet?.status === "closed").length, 0);
  return {
    masterPlanNo: normalizedPlanNo,
    periodStart: rows[0]?.productionDate || null,
    periodEnd: rows.at(-1)?.productionDate || null,
    rows,
    summary: {
      planRows: rows.length,
      outputLots: outputCount,
      waitingOutput: rows.filter((row) => !row.outputs.length).length,
      costSheets: sheetCount,
      closed: closedCount,
      problems: rows.filter((row) => !row.hasBomSnapshot).length,
    },
  };
}

function costTreeItem(row, children = []) {
  const qty = Number(row.qty ?? row.costQty ?? row.weightKg ?? 0);
  const unitCost = Number(row.unit_price ?? row.unitCost ?? 0);
  const type = row.type || row.item_type || row.itemType || "RM";
  const costSheetId = row.costSheetId || null;
  const costSheetStatus = row.costSheetStatus || null;
  const savedStatus = row.status || row.allocation_status || "pending";
  const status = ["WIP", "MANUAL_WIP"].includes(type) && costSheetId && costSheetStatus !== "closed"
    ? "manual_review"
    : savedStatus;
  return {
    type,
    code: row.code || row.item_code || row.materialCode || null,
    name: row.name || row.item_name || row.materialName || null,
    lotNo: row.lotNo || row.lot_no || null,
    qty,
    uomName: row.uomName || row.uom_name || row.costUomName || null,
    unitCost: unitCost || null,
    totalCost: Number(row.total_amount ?? (qty * unitCost)) || null,
    status,
    source: row.source || row.sourceDocRef || row.source_doc_ref || null,
    grossQty: Number(row.grossQty ?? row.grossIssuedQty ?? row.grossIssueQty ?? 0),
    returnQty: Number(row.returnQty || 0),
    returnDocRefs: Array.isArray(row.returnDocRefs) ? row.returnDocRefs : [],
    sourceUomName: row.sourceUomName || row.uomName || row.uom_name || null,
    sourceKind: row.sourceKind || row.source_kind || null,
    costSource: row.costSource || null,
    note: row.note || row.exception_reason || null,
    productionDate: row.productionDate || row.production_date || parseCostingLotDate(row.lotNo || row.lot_no),
    costSheetId,
    costSheetStatus,
    dlCost: Number(row.dlCost || 0),
    overheadCost: Number(row.overheadCost || 0),
    children,
  };
}

function costSheetStage(sheet) {
  if (!sheet) return {};
  return {
    costSheetId: sheet.id,
    costSheetStatus: sheet.status,
    dlCost: Number(sheet.dl_cost || 0),
    overheadCost: Number(sheet.overhead_cost || 0),
    productionDate: sheet.production_date,
  };
}

function countTreeStatuses(nodes, statuses) {
  return nodes.reduce((count, node) => count
    + (statuses.has(node.status) ? 1 : 0)
    + countTreeStatuses(node.children || [], statuses), 0);
}

function treeNodeCost(node) {
  if (Number(node.totalCost) > 0) return Number(node.totalCost);
  return (node.children || []).reduce((sum, child) => sum + treeNodeCost(child), 0)
    + Number(node.dlCost || 0)
    + Number(node.overheadCost || 0);
}

async function findSheetForOutput(db, skuCode, lotNo, context) {
  if (!skuCode || !lotNo) return null;
  return memoizedRequest(context, "sheetsByOutput", costingOutputKey(skuCode, lotNo), async () => {
    const { data, error } = await db.from("production_cost_sheets")
      .select("*")
      .eq("sku_code", skuCode)
      .eq("lot_no", lotNo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    return data ? getCostSheetById(data.id) : null;
  });
}

function costingOutputKey(skuCode, lotNo) {
  return `${String(skuCode || "").trim().toUpperCase()}|${String(lotNo || "").trim()}`;
}

function memoizedRequest(context, cacheName, key, load) {
  if (!context) return load();
  const cache = context[cacheName] || (context[cacheName] = new Map());
  if (!cache.has(key)) cache.set(key, Promise.resolve().then(load));
  return cache.get(key);
}

function costTreeEvidenceKey(row) {
  return [
    row.source || row.sourceDocRef || row.source_doc_ref,
    row.code || row.materialCode || row.item_code,
    row.lotNo || row.lot_no,
  ].map((value) => String(value || "").trim().toUpperCase()).join("|");
}

function currentBomScaleBase(version) {
  const baseBatch = Number(version?.base_batch || 0);
  const baseOutput = Number(version?.base_output_boxes || 0);
  return baseOutput || baseBatch || 1;
}

async function loadBiscuitShellPreviewDocumentNos(db, productionDate, skuCode) {
  const { data: rooms, error: roomError } = await db.from("production_work_centers")
    .select("id")
    .eq("code", "BIS01")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (roomError) throw new ApiError(500, roomError.message);
  const roomIds = new Set((rooms || []).map((row) => String(row.id)));
  const { data: groups, error: groupError } = await db.from("production_requisition_group_batches")
    .select("document_no,metadata")
    .eq("status", "exported")
    .eq("metadata->>selectedDate", productionDate)
    .not("document_no", "is", null);
  if (groupError) throw new ApiError(500, groupError.message);
  return selectPreviewDocumentNosForOutput({
    groups,
    skuCode,
    roomIds: [...roomIds],
  });
}

async function buildActualOutputBomProducts({ db, productionDate, targetSkuCode, targetLotNo, targetOutputQty, issueRows, context }) {
  const candidates = await memoizedRequest(context, "candidatesByDate", productionDate, () => (
    listProductionCostCandidates({ dateFrom: productionDate, dateTo: productionDate })
  ));
  const shellOnly = /^WKB-/i.test(String(targetSkuCode || ""));
  const outputs = (candidates.data || []).filter((row) => row.costType === "WIP"
    && (!shellOnly || (row.source === "ใบชั่งรับผลผลิต" && /^WKB-/i.test(String(row.skuCode || ""))))
    && row.lotNo
    && Number(row.actualWeightKg || row.actualQty) > 0);
  if (!outputs.some((row) => row.skuCode === targetSkuCode && row.lotNo === targetLotNo)) {
    outputs.push({ skuCode: targetSkuCode, skuName: targetSkuCode, lotNo: targetLotNo, actualWeightKg: targetOutputQty, actualQty: targetOutputQty });
  }
  const skuCodes = [...new Set(outputs.map((row) => row.skuCode).filter(Boolean))];
  const { data: planBoms, error: planBomError } = await db.from("production_plan_status")
    .select("sku_code,planned_qty,bom_snapshot")
    .eq("period_start", productionDate)
    .in("sku_code", skuCodes);
  if (planBomError) throw new ApiError(500, planBomError.message);
  const { data: boms, error: bomError } = await db.from("production_boms").select("id,sku_code").in("sku_code", skuCodes);
  if (bomError) throw new ApiError(500, bomError.message);
  const { data: versions, error: versionError } = boms?.length
    ? await db.from("production_bom_versions")
      .select("id,bom_id,version_no,base_batch,base_output_boxes,wip_qty_input_mode,formula_code")
      .in("bom_id", boms.map((row) => row.id))
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("version_no", { ascending: false })
    : { data: [], error: null };
  if (versionError) throw new ApiError(500, versionError.message);
  const latestByBom = new Map();
  (versions || []).forEach((version) => {
    const current = latestByBom.get(version.bom_id);
    if (!current || (String(version.formula_code || "DEFAULT").toUpperCase() === "DEFAULT"
      && String(current.formula_code || "DEFAULT").toUpperCase() !== "DEFAULT")) latestByBom.set(version.bom_id, version);
  });
  const versionIds = [...latestByBom.values()].map((row) => row.id);
  const { data: items, error: itemError } = versionIds.length
    ? await db.from("production_bom_items")
      .select("version_id,material_sku_code,material_goods_code,qty,uom_name,products_cache(sku_name,iccat_code)")
      .in("version_id", versionIds)
    : { data: [], error: null };
  if (itemError) throw new ApiError(500, itemError.message);
  const bomBySku = new Map((boms || []).flatMap((bom) => {
    const version = latestByBom.get(bom.id);
    if (!version) return [];
    return [[bom.sku_code, {
      version,
      items: (items || []).filter((item) => item.version_id === version.id),
    }]];
  }));
  (planBoms || []).forEach((plan) => {
    const materials = extractBomSnapshotMaterials(plan.bom_snapshot);
    if (!materials.length || !(Number(plan.planned_qty) > 0)) return;
    bomBySku.set(plan.sku_code, {
      version: { base_batch: Number(plan.planned_qty) },
      items: materials.map((item) => ({
        material_sku_code: item.skuCode,
        material_goods_code: item.goodsCode,
        qty: item.requiredQty,
        uom_name: item.uomName,
        products_cache: {
          sku_name: item.name,
          iccat_code: item.itemType === "WIP" ? "03" : "01",
        },
      })),
    });
  });
  const issuedCodes = new Set((issueRows || []).map((row) => String(row.materialCode || row.TRD_SH_CODE || "").trim().toUpperCase()).filter(Boolean));
  const issuedSkus = new Set((issueRows || []).map((row) => String(row.materialSkuCode || "").trim().toUpperCase()).filter(Boolean));
  return outputs.flatMap((output) => {
    const bom = bomBySku.get(output.skuCode);
    if (!bom?.items.length) return [];
    const isTarget = output.skuCode === targetSkuCode && output.lotNo === targetLotNo;
    const overlapsIssue = bom.items.some((item) =>
      issuedCodes.has(String(item.material_goods_code || item.material_sku_code || "").trim().toUpperCase())
      || issuedSkus.has(String(item.material_sku_code || "").trim().toUpperCase()));
    if (!isTarget && !overlapsIssue) return [];
    const actualOutputQty = Number(output.actualWeightKg || output.actualQty || 0);
    return [{
      productCode: costingOutputKey(output.skuCode, output.lotNo),
      productName: output.skuName || output.skuCode,
      plannedQty: actualOutputQty,
      materials: bom.items.map((item) => ({
        materialSkuCode: item.material_sku_code,
        materialCode: item.material_goods_code || item.material_sku_code,
        materialName: item.products_cache?.sku_name || item.material_goods_code || item.material_sku_code,
        requiredQty: actualBomDemand(item.qty, actualOutputQty, currentBomScaleBase(bom.version)),
        uomName: item.uom_name,
        itemType: String(item.products_cache?.iccat_code || "").startsWith("03") ? "WIP" : "RM",
      })),
    }];
  });
}

async function buildUnplannedWipCostChildren({ db, skuCode, lotNo, productionDate, outputQty: fallbackOutputQty, depth, visited, context }) {
  const isShellWip = /^WKB-/i.test(String(skuCode || ""));
  const { data: bom, error: bomError } = await db.from("production_boms")
    .select("id")
    .eq("sku_code", skuCode)
    .limit(1)
    .maybeSingle();
  if (bomError) throw new ApiError(500, bomError.message);
  if (!bom) throw new ApiError(404, "ไม่พบ BOM ปัจจุบันของ WIP");

  const { data: version, error: versionError } = await db.from("production_bom_versions")
    .select("id,base_batch,base_output_boxes,wip_qty_input_mode")
    .eq("bom_id", bom.id)
    .eq("status", "approved")
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new ApiError(500, versionError.message);
  if (!version) throw new ApiError(404, "ไม่พบ BOM ที่อนุมัติแล้วของ WIP");

  const { data: bomItems, error: itemError } = await db.from("production_bom_items")
    .select("material_sku_code,material_goods_code,qty,uom_name,products_cache(sku_name,iccat_code)")
    .eq("version_id", version.id);
  if (itemError) throw new ApiError(500, itemError.message);
  if (!bomItems?.length) throw new ApiError(404, "BOM ปัจจุบันไม่มีรายการวัตถุดิบ");

  const [{ data: configs, error: configError }, { data: lots, error: lotError }] = await Promise.all([
    db.from("production_weight_scale_products").select("id").eq("sku_code", skuCode),
    db.from("production_weight_scale_lots").select("id").eq("lot_code", lotNo),
  ]);
  if (configError) throw new ApiError(500, configError.message);
  if (lotError) throw new ApiError(500, lotError.message);
  const configIds = (configs || []).map((row) => row.id);
  const lotIds = (lots || []).map((row) => row.id);
  const receipts = configIds.length && lotIds.length ? await fetchAllSupabaseRows(() => db.from("production_weight_receipts")
    .select("net_weight_kg,metadata")
    .in("product_config_id", configIds)
    .in("lot_id", lotIds)
    .eq("status", "recorded")
    .order("id")) : [];
  const outputQty = receipts
    .filter((row) => !row.metadata?.isReturn)
    .reduce((sum, row) => sum + Number(row.net_weight_kg || 0), 0) || Number(fallbackOutputQty || 0);
  if (!(outputQty > 0)) throw new ApiError(404, "ยอดรับเข้าผลผลิต LOT นี้เป็นศูนย์");

  const previewGroups = isShellWip ? [] : await memoizedRequest(context, "previewGroupsByDate", productionDate, async () => {
    const { data, error } = await db.from("production_requisition_group_batches")
      .select("document_no,metadata")
      .eq("status", "exported")
      .eq("metadata->>selectedDate", productionDate)
      .not("document_no", "is", null);
    if (error) throw new ApiError(500, error.message);
    return data || [];
  });
  const previewDocumentNos = isShellWip
    ? await memoizedRequest(context, "previewDocumentsByDate", `${productionDate}|${skuCode}`, () => (
      loadBiscuitShellPreviewDocumentNos(db, productionDate, skuCode)
    ))
    : [...new Set(previewGroups
      .filter((group) => String(group.metadata?.parentSku || "").trim().toUpperCase() === String(skuCode).trim().toUpperCase())
      .map((group) => String(group.document_no || "").trim())
      .filter(Boolean))];
  const requisitionRows = await memoizedRequest(context, "requisitionsByDate", productionDate, () => (
    loadRequisitionRowsForProductionDate(productionDate, previewDocumentNos)
  ));
  const matchingIssueRows = filterActualRequisitionRows({
    rows: requisitionRows,
    productionDate,
    preferredDocumentNos: previewDocumentNos,
  });
  const filteredIssueRows = previewDocumentNos.length ? matchingIssueRows : matchingIssueRows.filter((row) => (
    String(row.DI_DATE || "").slice(0, 10) === productionRequisitionFallbackDate(productionDate)
  ));
  const candidateIssueRows = isShellWip ? filteredIssueRows : excludePreviewDocumentsOwnedByOtherOutputs({
    rows: filteredIssueRows,
    groups: previewGroups,
    skuCode,
  });
  const candidateGoodsCodes = [...new Set(candidateIssueRows.map((row) => String(row.TRD_SH_CODE || "").trim()).filter(Boolean))];
  const { data: tradeAliases, error: tradeAliasError } = candidateGoodsCodes.length
    ? await db.from("pallet_trade_code_barcodes").select("goods_code,sku_code").in("goods_code", candidateGoodsCodes)
    : { data: [], error: null };
  if (tradeAliasError) throw new ApiError(500, tradeAliasError.message);
  const candidateSkuByGoods = new Map((tradeAliases || []).map((row) => [
    String(row.goods_code || "").trim().toUpperCase(),
    String(row.sku_code || "").trim().toUpperCase(),
  ]));
  const routedCandidateRows = candidateIssueRows.map((row) => ({
    ...row,
    materialSkuCode: candidateSkuByGoods.get(String(row.TRD_SH_CODE || "").trim().toUpperCase()),
  }));
  const { data: routingComponents, error: routingError } = isShellWip
    ? { data: [], error: null }
    : await db.from("production_routing_components")
      .select("component_sku_code,work_center_id,issue_owner_department_id,production_work_centers:work_center_id(code,name)")
      .eq("fg_sku_code", skuCode)
      .eq("parent_sku_code", skuCode)
      .eq("is_active", true)
      .is("deleted_at", null);
  if (routingError) throw new ApiError(500, routingError.message);
  const routingDepartmentIds = [...new Set((routingComponents || [])
    .map((row) => row.issue_owner_department_id)
    .filter(Boolean))];
  const { data: routingDepartments, error: routingDepartmentError } = routingDepartmentIds.length
    ? await db.from("production_departments").select("id,code").in("id", routingDepartmentIds)
    : { data: [], error: null };
  if (routingDepartmentError) throw new ApiError(500, routingDepartmentError.message);
  const departmentCodeById = new Map((routingDepartments || []).map((row) => [row.id, row.code]));
  const routedDocuments = selectRoutedRequisitionDocuments({
    rows: routedCandidateRows,
    routingRows: (routingComponents || []).map((row) => ({
      componentSkuCode: row.component_sku_code,
      workCenterId: row.work_center_id,
      workCenterCode: row.production_work_centers?.code,
      workCenterName: row.production_work_centers?.name,
      issueOwnerDepartmentCode: departmentCodeById.get(row.issue_owner_department_id),
    })),
  });
  const wantedCodes = bomItems.flatMap((item) => [item.material_goods_code, item.material_sku_code]).filter(Boolean);
  const selectedDocuments = isShellWip
    ? (previewDocumentNos.length ? selectRequisitionDocuments({
      rows: routedCandidateRows,
      wantedCodes,
      preferredDocumentNos: previewDocumentNos,
    }) : selectBiscuitShellRequisitionDocuments({ rows: routedCandidateRows, productionDate, wantedCodes }))
    : (previewDocumentNos.length
      ? selectRequisitionDocuments({
        rows: routedCandidateRows,
        wantedCodes,
        preferredDocumentNos: previewDocumentNos,
      })
      : routedDocuments.length
        ? routedDocuments
        : routingComponents?.length
          ? []
          : selectRequisitionDocuments({ rows: routedCandidateRows, wantedCodes }));
  const issueRows = selectedDocuments.flatMap(([, rows]) => rows);
  const documents = [...new Set(issueRows.map((row) => row.DI_REF).filter(Boolean))];
  if (!documents.length) throw new ApiError(404, "ไม่พบใบเบิกจริงที่ตรงกับ BOM และวันที่ผลิต");
  const returns = await fetchReturnsForRequisitions(documents, productionDate);
  const currentSkuByGoods = await loadCurrentSkuByGoods(issueRows.map((row) => row.TRD_SH_CODE));
  const skuByGoods = new Map([
    ...bomItems.map((item) => [String(item.material_goods_code || "").trim().toUpperCase(), item.material_sku_code]),
    ...currentSkuByGoods,
  ]);
  const itemTypeByGoods = new Map(bomItems.map((item) => [
    item.material_goods_code,
    String(item.products_cache?.iccat_code || "").startsWith("03") ? "WIP" : "RM",
  ]));
  const grossIssues = applyMaterialSkuLookup(issueRows.map((row) => {
    const packSize = Number(row.TRD_UTQQTY || 0) || 1;
    const grossQty = Number(row.TRD_SH_QTY || 0);
    return {
      materialCode: row.TRD_SH_CODE,
      materialSkuCode: skuByGoods.get(String(row.TRD_SH_CODE || "").trim().toUpperCase()),
      materialName: row.TRD_SH_NAME,
      issueQty: grossQty,
      packSize,
      uomName: row.TRD_UTQNAME,
      lotNo: row.TRD_LOT_NO,
      sourceDocRef: row.DI_REF,
      itemType: itemTypeByGoods.get(row.TRD_SH_CODE) || (/^(?:WK|WKB)-/.test(String(row.TRD_SH_CODE || "")) ? "WIP" : "RM"),
      baseUnitCost: grossQty > 0 ? Number(row.TRD_SH_GAMT || 0) / (grossQty * packSize) : null,
    };
  }), skuByGoods);
  const returnLines = returns.filter((row) => Number(row.DI_ACTIVE) === 0).map((row) => ({
    materialCode: row.TRD_SH_CODE,
    lotNo: row.TRD_LOT_NO,
    returnQty: row.TRD_SH_QTY,
    sourceDocRef: row.TRD_REFER_REF,
    returnDocRef: row.DI_REF,
  }));
  const netIssues = netIssueLinesByReturns({ issueLines: grossIssues, returnLines });
  const issueEvidenceByKey = new Map(netIssues.reconciliation.map((row) => [row.key, row]));
  const targetProductCode = costingOutputKey(skuCode, lotNo);
  let products = await buildActualOutputBomProducts({
    db,
    productionDate,
    targetSkuCode: skuCode,
    targetLotNo: lotNo,
    targetOutputQty: outputQty,
    issueRows: grossIssues,
    context,
  });
  if (!isShellWip) products = products.filter((product) => product.productCode === targetProductCode);
  if (!products.some((product) => product.productCode === targetProductCode)) {
    const scaleBase = currentBomScaleBase(version);
    products.push({
      productCode: targetProductCode,
      productName: skuCode,
      plannedQty: outputQty,
      materials: bomItems.map((item) => ({
        materialSkuCode: item.material_sku_code,
        materialCode: item.material_goods_code,
        materialName: item.products_cache?.sku_name || item.material_goods_code,
        requiredQty: actualBomDemand(item.qty, outputQty, scaleBase),
        uomName: item.uom_name,
        itemType: String(item.products_cache?.iccat_code || "").startsWith("03") ? "WIP" : "RM",
      })),
    });
  }
  const allocation = allocateSharedIssuesByBom({ products, issueLines: netIssues.issueLines });
  const zeroUseAllocation = allocateSharedIssuesByBom({
    products,
    issueLines: netIssues.zeroUseLines.map((row) => ({ ...row, issueQty: row.grossIssueQty })),
  });
  const issueCostByKey = new Map(grossIssues.map((row) => [
    `${row.sourceDocRef}|${row.materialCode}|${row.lotNo || ""}`,
    row.baseUnitCost,
  ]));
  const children = [];
  const targetAllocations = allocation.allocations.filter((row) => row.productCode === targetProductCode);
  const rmCostByKey = await loadRawMaterialLotCostMap([...targetAllocations, ...allocation.unmatchedIssues]);
  for (const row of [...targetAllocations, ...allocation.unmatchedIssues]) {
    const issueEvidence = issueEvidenceByKey.get(costTreeEvidenceKey(row));
    const allocatedBaseQty = Number(row.allocatedBaseQty ?? row.issueBaseQty ?? 0);
    const nested = row.itemType === "WIP" && row.lotNo
      ? await expandOutputCostNode({
        db,
        skuCode: resolveUpstreamCostSku(row),
        skuName: row.materialName,
        lotNo: row.lotNo,
        qty: allocatedBaseQty,
        uomName: "kg",
        depth: depth + 1,
        visited,
        context,
      })
      : [];
    const sourceUnitCost = issueCostByKey.get(`${row.sourceDocRef}|${row.materialCode}|${row.lotNo || ""}`);
    const rmCost = rmCostByKey.get(`${row.sourceMaterialSkuCode || row.materialSkuCode}|${row.lotNo}`);
    const unitCost = resolveAllocatedIssueUnitCost({
      itemType: row.itemType,
      nestedUnitCost: nested.derivedUnitCost,
      rawMaterialUnitCost: rmCost ? rawMaterialUnitCostExclVat(rmCost) : null,
      sourceUnitCost,
    });
    children.push(costTreeItem({
      ...row,
      qty: allocatedBaseQty,
      uomName: "kg",
      unitCost,
      total_amount: unitCost == null ? null : allocatedBaseQty * unitCost,
      grossQty: row.grossIssuedQty ?? row.grossIssueQty ?? issueEvidence?.grossIssueQty,
      returnQty: row.returnQty ?? issueEvidence?.returnQty,
      returnDocRefs: row.returnDocRefs?.length ? row.returnDocRefs : issueEvidence?.returnDocRefs,
      sourceUomName: row.uomName,
      costSource: nested.costSource || rmCost?.LATEST_SOURCE_REF,
      status: unitCost == null ? "missing_cost" : allocation.unmatchedIssues.includes(row) ? "manual_review" : "actual",
      note: nested.sourceNote || (allocation.unmatchedIssues.includes(row) ? "พบในใบเบิกจริง แต่ไม่อยู่ใน BOM ปัจจุบัน" : `จัดสรรจากผลผลิตจริง ${outputQty.toLocaleString("th-TH", { maximumFractionDigits: 3 })} kg ตามสัดส่วน BOM ของ ${products.length} ผลผลิต`),
    }, nested));
  }
  const targetZeroUse = zeroUseAllocation.allocations.filter((row) => row.productCode === targetProductCode);
  targetZeroUse.forEach((row) => children.push(costTreeItem({
    ...row,
    qty: 0,
    grossQty: row.allocatedQty,
    returnQty: row.allocatedQty,
    sourceUomName: row.uomName,
    status: "actual",
    note: "เบิกแล้วคืนครบ ใช้จริง 0 และไม่คิดต้นทุน",
  })));
  const zeroUseDemandKeys = new Set(targetZeroUse.map((row) => row.demandMaterialKey));
  allocation.missingIssues.filter((row) => row.productCode === targetProductCode
    && !zeroUseDemandKeys.has(row.materialKey)).forEach((row) => children.push(costTreeItem({
    type: row.itemType,
    code: row.materialCode,
    name: row.materialName,
    qty: 0,
    uomName: row.uomName,
    status: "missing_cost",
    note: "มีใน BOM ปัจจุบัน แต่ไม่พบในใบเบิกจริง",
  })));
  children.derivedUnitCost = children.reduce((sum, item) => sum + treeNodeCost(item), 0) / outputQty;
  children.batchOutputQty = outputQty;
  children.sourceNote = `รับเข้าทั้ง LOT ${outputQty.toLocaleString("th-TH", { maximumFractionDigits: 3 })} kg · จัดสรรตาม BOM ระหว่าง ${products.length} ผลผลิต · ใบเบิก ${documents.join(", ")}`;
  return children;
}

async function expandOutputCostNode({ db, skuCode, skuName, lotNo, qty: outputQty, uomName, depth = 0, visited = new Set(), context }) {
  const key = `${skuCode}|${lotNo}`;
  if (depth > 4 || visited.has(key)) return [];
  const nextVisited = new Set(visited).add(key);
  const existingSheet = await findSheetForOutput(db, skuCode, lotNo, context);
  if (existingSheet?.materials?.length) {
    const children = [];
    for (const material of existingSheet.materials) {
      const upstreamSheet = material.item_type === "WIP" && material.lot_no
        ? await findSheetForOutput(db, material.item_code, material.lot_no, context)
        : null;
      const nested = material.item_type === "WIP" && material.lot_no
        ? await expandOutputCostNode({
          db,
          skuCode: material.item_code,
          skuName: material.item_name,
          lotNo: material.lot_no,
          qty: material.qty,
          uomName: material.uom_name,
          depth: depth + 1,
          visited: nextVisited,
          context,
        })
        : [];
      children.push(costTreeItem({ ...material, ...costSheetStage(upstreamSheet) }, nested));
    }
    if (existingSheet.status === "closed" && Number(existingSheet.unit_cost) > 0) {
      children.derivedUnitCost = Number(existingSheet.unit_cost);
      children.batchOutputQty = Number(existingSheet.actual_weight_kg || existingSheet.actual_qty || 0);
      children.costSource = `Cost Sheet ${existingSheet.id}`;
    }
    return children;
  }

  const productionDate = parseCostingLotDate(lotNo);
  if (!productionDate) return [costTreeItem({
    type: "MANUAL_WIP",
    code: skuCode,
    name: skuName,
    lotNo,
    qty: outputQty,
    uomName,
    status: "manual_required",
    note: "ไม่สามารถอ่านวันผลิตจาก LOT ได้ กรุณาบันทึกต้นทุน Manual",
  })];

  if (String(skuCode || "").replace(/-/g, "").startsWith("WK220")) {
    try {
      const draft = await memoizedRequest(context, "flourDrafts", costingOutputKey(skuCode, lotNo), () => (
        buildFlourCostDraft(lotNo, { skuCode })
      ));
      if (draft.materials.length && Number(draft.output_weight_kg) > 0) {
        const receiptRefs = [...new Set(draft.output_products.map((row) => row.doc_ref).filter(Boolean))];
        const receiptSource = receiptRefs.join(", ");
        const children = [];
        children.derivedUnitCost = draft.unit_cost;
        children.batchOutputQty = draft.output_weight_kg;
        children.costSource = receiptSource;
        children.sourceNote = `รับเข้าผลิต ${receiptSource} · ${draft.output_weight_kg.toLocaleString("th-TH", { maximumFractionDigits: 3 })} kg`;
        return children;
      }
    } catch {
      // Continue to the ordinary plan/BOM lookup below.
    }
  }

  let actualIssueError = null;
  if (prefersActualWipIssueAllocation(skuCode)) {
    try {
      return await buildUnplannedWipCostChildren({ db, skuCode, lotNo, productionDate, outputQty, depth, visited: nextVisited, context });
    } catch (error) {
      actualIssueError = error;
    }
  }

  try {
    const preview = await buildBomAllocationPreview({ productionDate, skuCode, context });
    const allocations = preview.allocations.filter((row) => row.productCode === skuCode);
    const children = [];
    for (const row of allocations) {
      const nested = row.itemType === "WIP" && row.lotNo
        ? await expandOutputCostNode({
          db,
          skuCode: resolveUpstreamCostSku(row),
          skuName: row.materialName,
          lotNo: row.lotNo,
          qty: row.costQty,
          uomName: row.costUomName,
          depth: depth + 1,
          visited: nextVisited,
          context,
        })
        : [];
      const nestedCost = nested.reduce((sum, item) => sum + treeNodeCost(item), 0);
      const derivedUnitCost = row.itemType === "WIP" && Number(row.costQty) > 0
        ? nested.derivedUnitCost || (nestedCost > 0 ? nestedCost / Number(row.costQty) : null)
        : null;
      const nestedHasProblem = nested.some((item) => ["manual_required", "missing_cost"].includes(item.status));
      children.push(costTreeItem({
        ...row,
        unitCost: row.unitCost ?? derivedUnitCost,
        costSource: nested.costSource,
        note: nested.sourceNote || row.note,
        status: row.unitCost != null ? "actual" : derivedUnitCost && !nestedHasProblem ? "manual_review" : "missing_cost",
      }, nested));
    }
    preview.unmatchedIssues.forEach((row) => children.push(costTreeItem({
      ...row,
      qty: row.costQty || row.issueBaseQty || row.issueQty,
      status: row.unitCost == null ? "missing_cost" : "manual_review",
      note: "พบในใบเบิกจริง แต่ไม่ตรง BOM จึงต้องตรวจยืนยันก่อนปิดต้นทุน",
    })));
    preview.zeroUseIssues.forEach((row) => children.push(costTreeItem({
      ...row,
      qty: 0,
      status: "actual",
      note: "เบิกแล้วคืนครบ ใช้จริง 0 และไม่คิดต้นทุน",
    })));
    if (!children.length) throw new ApiError(404, "ไม่พบรายการต้นทุนจากแผน จึงค้นจากผลผลิตและใบเบิกจริงแทน");
    return children;
  } catch (error) {
    if (!prefersActualWipIssueAllocation(skuCode)) {
      try {
        return await buildUnplannedWipCostChildren({ db, skuCode, lotNo, productionDate, outputQty, depth, visited: nextVisited, context });
      } catch {
        // Keep the original plan/group error because it is the primary lookup path.
      }
    }
    return [costTreeItem({
      type: "MANUAL_WIP",
      code: skuCode,
      name: skuName,
      lotNo,
      qty: outputQty,
      uomName,
      status: "manual_required",
      note: `ยังเชื่อมใบเบิกของ WIP นี้ไม่ได้: ${(actualIssueError || error).message}`,
    })];
  }
}

async function buildExecutiveCostReport(sheet, context = {}) {
  const db = getSupabaseAdmin();
  const wipCost = (sheet.materials || [])
    .filter((item) => item.item_type === "WIP")
    .reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const [skuAliasRows, goodsAliasRows, productRow] = await Promise.all([
    db.from("pallet_trade_code_barcodes").select("goods_code,sku_code").eq("sku_code", sheet.sku_code),
    db.from("pallet_trade_code_barcodes").select("goods_code,sku_code").eq("goods_code", sheet.sku_code),
    db.from("products_cache").select("image_url").eq("sku_code", sheet.sku_code).limit(1).maybeSingle(),
  ]);
  if (skuAliasRows.error) throw new ApiError(500, skuAliasRows.error.message);
  if (goodsAliasRows.error) throw new ApiError(500, goodsAliasRows.error.message);
  if (productRow.error) throw new ApiError(500, productRow.error.message);
  const aliases = new Set([sheet.sku_code]);
  [...(skuAliasRows.data || []), ...(goodsAliasRows.data || [])].forEach((row) => {
    aliases.add(row.sku_code);
    aliases.add(row.goods_code);
  });
  const pieceRateLabor = await loadPieceRateLaborSummary(db, sheet.sku_code, sheet.lot_no, aliases);
  const { data: bomRows, error: bomError } = await db.from("production_boms")
    .select("id")
    .in("sku_code", [...aliases]);
  if (bomError) throw new ApiError(500, bomError.message);
  const bomIds = (bomRows || []).map((row) => row.id);
  const { data: bomVersions, error: bomVersionError } = bomIds.length
    ? await db.from("production_bom_versions").select("id").in("bom_id", bomIds)
    : { data: [], error: null };
  if (bomVersionError) throw new ApiError(500, bomVersionError.message);
  const versionIds = (bomVersions || []).map((row) => row.id);
  const { data: jamBomItems, error: jamBomError } = versionIds.length
    ? await db.from("production_bom_items").select("material_goods_code,material_sku_code").in("version_id", versionIds).in("material_goods_code", JAM_GOODS_CODES)
    : { data: [], error: null };
  if (jamBomError) throw new ApiError(500, jamBomError.message);
  const allowedJamCodes = new Set((jamBomItems || []).flatMap((i) => [i.material_goods_code, i.material_sku_code].filter(Boolean)));
  const requiresJam = allowedJamCodes.size > 0;
  const report = await loadProductionInputOutputReportData(db, {
    dateFrom: sheet.production_date,
    dateTo: sheet.production_date,
    includeWaste: false,
    includeJam: requiresJam,
  });
  const day = report.days.find((row) => row.date === sheet.production_date);
  const fgRows = (day?.rows || []).filter((row) => aliases.has(row.fgCode));
  const allDayFgCodes = new Set((day?.rows || []).map((row) => row.fgCode).filter(Boolean));
  const shellNodes = (await Promise.all(fgRows.map(async (row) => {
    const shellSku = await memoizedRequest(context, "skuByGoodsCode", row.shellCode, async () => {
      const result = await db.from("pallet_trade_code_barcodes").select("sku_code").eq("goods_code", row.shellCode).limit(1).maybeSingle();
      if (result.error) throw new ApiError(500, result.error.message);
      return result.data?.sku_code || row.shellCode;
    });

    // Find all raw shell lots for this shell code across all rows on this date
    const allShellLotsForCode = (day?.rows || [])
      .filter((r) => r.shellCode === row.shellCode && (r.shellLots || []).length > 0)
      .flatMap((r) => r.shellLots || []);

    // Find all active products on this date sharing this shell code
    const sharingProducts = (day?.rows || [])
      .filter((r) => r.shellCode === row.shellCode && Number(r.fgWeightKg || 0) > 0)
      .map((r) => ({ skuCode: r.fgCode, skuName: r.fgName, actualWeightKg: Number(r.fgWeightKg) }));

    let allocatedLots = row.shellLots || [];
    if (allShellLotsForCode.length > 0 && sharingProducts.length > 1) {
      const allocations = allocateBiscuitSandwichShellAndJam({
        products: sharingProducts,
        availableShellLots: allShellLotsForCode,
      });
      const thisAlloc = allocations.find((a) => aliases.has(a.skuCode));
      if (thisAlloc?.allocatedShellLots?.length) {
        allocatedLots = thisAlloc.allocatedShellLots;
      }
    } else if (!allocatedLots.length && allShellLotsForCode.length > 0) {
      allocatedLots = allShellLotsForCode;
    }

    return Promise.all((allocatedLots || []).map(async (lot) => {
      const shellSheet = await findSheetForOutput(db, shellSku, lot.lotNo, context);
      const children = await expandOutputCostNode({
        db,
        skuCode: shellSku,
        skuName: row.shellName,
        lotNo: lot.lotNo,
        qty: lot.weightKg,
        uomName: "kg",
        context,
      });
      return costTreeItem({
        type: "WIP",
        code: shellSku,
        name: row.shellName,
        lotNo: lot.lotNo,
        qty: lot.weightKg,
        uomName: "kg",
        unitCost: shellSheet?.unit_cost ?? children.derivedUnitCost,
        status: children.some((item) => ["manual_required", "missing_cost"].includes(item.status))
          ? "manual_required"
          : children.some((item) => ["manual_review", "shared_pending"].includes(item.status)) || shellSheet?.status !== "closed"
            ? "manual_review"
            : "actual",
        source: "รายงาน Input/Output",
        note: children.sourceNote || null,
        ...costSheetStage(shellSheet),
      }, children);
    }));
  }))).flat();

  const discoveredRootNodes = (sheet.materials || []).length ? [] : await expandOutputCostNode({
    db,
    skuCode: sheet.sku_code,
    skuName: sheet.sku_name,
    lotNo: sheet.lot_no,
    qty: sheet.actual_qty,
    uomName: sheet.uom_name,
    context,
  });

  const savedJamItems = (sheet.materials || []).filter((item) => JAM_GOODS_CODES.includes(String(item.item_code || "").toUpperCase()));
  let jamNodes = [];
  if (savedJamItems.length) {
    jamNodes = savedJamItems.map((item) => costTreeItem({ ...item, type: "RM", status: item.allocation_status || "actual" }));
  } else {
    jamNodes = buildInputOutputJamCostRows(day?.rows || [], [...aliases]).map((item) => costTreeItem(item));
  }
  const excludedCodes = new Set([...JAM_GOODS_CODES, ...shellNodes.map((item) => item.code)]);
  const rawOtherNodes = (sheet.materials || []).length
    ? (sheet.materials || []).map((item) => costTreeItem(item))
    : discoveredRootNodes;
  const otherNodes = rawOtherNodes
    .filter((item) => !excludedCodes.has(String(item.code || "").toUpperCase()))
    .filter((item) => !(shellNodes.length > 0 && item.code === sheet.sku_code && item.type === "MANUAL_WIP"));
  const tree = [...shellNodes, ...jamNodes, ...otherNodes];
  const manualCount = countTreeStatuses(tree, new Set(["manual_required", "manual_review", "missing_cost"]));
  const sharedCount = countTreeStatuses(tree, new Set(["shared_pending"]));
  const readyToClose = manualCount === 0 && sharedCount === 0;
  const calculatedWipCost = tree.filter((item) => ["WIP", "MANUAL_WIP"].includes(item.type))
    .reduce((sum, item) => sum + treeNodeCost(item), 0);
  const calculatedDirectCost = tree.filter((item) => !["WIP", "MANUAL_WIP"].includes(item.type))
    .reduce((sum, item) => sum + treeNodeCost(item), 0);
  const directMaterialCost = Number(sheet.material_cost || 0) > 0
    ? Number(sheet.material_cost || 0) - wipCost
    : calculatedDirectCost;
  const transferredWipCost = wipCost || calculatedWipCost;
  const savedDirectLabor = (sheet.expenses || []).find((item) => item.expense_type === "DL");
  const hasSavedDirectLabor = Boolean(savedDirectLabor);
  const autoDirectLabor = sheet.status !== "closed" && !hasSavedDirectLabor && pieceRateLabor.amount > 0;
  const directLaborFromPieceRate = autoDirectLabor || Boolean(savedDirectLabor?.is_auto_fetched);
  const directLaborCost = autoDirectLabor ? pieceRateLabor.amount : Number(sheet.dl_cost || 0);
  const calculatedTotalCost = directMaterialCost + transferredWipCost + directLaborCost + Number(sheet.overhead_cost || 0);
  const totalCost = autoDirectLabor ? calculatedTotalCost : Number(sheet.total_cost || 0) || calculatedTotalCost;
  const unitCost = Number(sheet.unit_cost || 0) || (Number(sheet.actual_qty || 0) > 0 ? totalCost / Number(sheet.actual_qty) : 0);
  return {
    generatedAt: new Date().toISOString(),
    sheet: {
      id: sheet.id,
      costNo: sheet.cost_no,
      costType: sheet.cost_type || "FG",
      masterPlanNo: sheet.master_plan_no,
      skuCode: sheet.sku_code,
      skuName: sheet.sku_name,
      lotNo: sheet.lot_no,
      productionDate: sheet.production_date,
      actualQty: Number(sheet.actual_qty || 0),
      actualWeightKg: sheet.actual_weight_kg == null ? null : Number(sheet.actual_weight_kg),
      uomName: sheet.uom_name,
      materialCost: Number(sheet.material_cost || 0),
      directMaterialCost,
      transferredWipCost,
      dlCost: directLaborCost,
      directLaborSource: directLaborFromPieceRate ? "piece_rate" : hasSavedDirectLabor ? "cost_sheet" : null,
      directLaborDocumentCount: directLaborFromPieceRate ? pieceRateLabor.documentCount : 0,
      directLaborEmployeeCount: directLaborFromPieceRate ? pieceRateLabor.employeeCount : 0,
      overheadCost: Number(sheet.overhead_cost || 0),
      totalCost,
      unitCost,
      status: sheet.status,
      costSheetId: sheet.id || null,
      imageUrl: productRow.data?.image_url || sheet.image_url || null,
    },
    tree,
    control: {
      shellLots: shellNodes.length,
      jamLots: jamNodes.length,
      manualCount,
      sharedCount,
      readyToClose,
      complete: readyToClose && sheet.status === "closed",
      warnings: report.warnings || [],
    },
  };
}

export async function getExecutiveCostReport(sheetId) {
  return buildExecutiveCostReport(await getCostSheetById(sheetId));
}

export async function getExecutiveCostReportForOutput({ skuCode, lotNo, productionDate }) {
  const db = getSupabaseAdmin();
  const existing = await findSheetForOutput(db, skuCode, lotNo);
  if (existing) return buildExecutiveCostReport(existing);

  const context = {};
  const candidates = await memoizedRequest(context, "candidatesByDate", productionDate, () => (
    listProductionCostCandidates({ dateFrom: productionDate, dateTo: productionDate })
  ));
  const output = candidates.data.find((row) => row.skuCode === skuCode && row.lotNo === lotNo);
  if (!output) throw new ApiError(404, "ไม่พบผลผลิตจริงตามวันที่ สินค้า และ LOT ที่เลือก");
  return buildExecutiveCostReport({
    id: null,
    cost_no: "ยังไม่มี Cost Sheet",
    cost_type: output.costType,
    sku_code: output.skuCode,
    sku_name: output.skuName,
    lot_no: output.lotNo,
    production_date: output.productionDate,
    master_plan_no: null,
    actual_qty: output.actualQty,
    actual_weight_kg: output.actualWeightKg,
    uom_name: output.uomName,
    material_cost: 0,
    dl_cost: 0,
    overhead_cost: 0,
    total_cost: 0,
    unit_cost: 0,
    status: "draft",
    image_url: output.imageUrl || null,
    materials: [],
    expenses: [],
  }, context);
}

/**
 * Fetch raw material requisitions for flour sifting matching target date
 */
export async function fetchFlourRequisitionData(thaiDateStr, targetIsoDate, remarkHint = "") {
  // We search for "ร่อนแป้ง" in raw-material-requisitions
  // Date range: up to 3 days before target date (handling Friday/Saturday entries for Monday)
  const targetDateObj = new Date(targetIsoDate);
  const fromDateObj = new Date(targetDateObj);
  fromDateObj.setDate(fromDateObj.getDate() - 3);
  const dateFrom = fromDateObj.toISOString().slice(0, 10);
  const dateTo = targetIsoDate;

  const params = new URLSearchParams({
    search: "ร่อนแป้ง",
    dateFrom,
    dateTo,
    pageSize: "100",
  });

  const res = await fetchGatewayJson("/api/raw-material-requisitions", params, "production");
  if (!res.ok) {
    throw new ApiError(res.status || 500, res.error?.message || "Failed to fetch requisitions from ERP");
  }

  const allRows = res.data?.data || [];
  // Filter for matching date in remark: e.g. "ร่อนแป้ง PLD แผนการผลิต, 18/09/2569"
  const matched = allRows.filter((r) => {
    const remark = String(r.DI_REMARK || "");
    return remark.includes(thaiDateStr);
  });

  const hinted = remarkHint
    ? matched.filter((row) => String(row.DI_REMARK || "").toUpperCase().includes(remarkHint.toUpperCase()))
    : [];
  return hinted.length ? hinted : matched;
}

/**
 * Fetch returns referencing given requisition refs
 */
export async function fetchReturnsForRequisitions(requisitionRefs = [], dateHint = "") {
  if (!requisitionRefs.length) return [];
  const cleanRefs = [...new Set(requisitionRefs.map((r) => String(r || "").trim()).filter(Boolean))];
  if (!cleanRefs.length) return [];

  const params = new URLSearchParams({
    issueRefs: cleanRefs.join("|"),
    pageSize: "500",
    includeTotal: "false",
  });
  if (dateHint && /^\d{4}-\d{2}-\d{2}$/.test(dateHint)) {
    params.set("dateFrom", dateDaysBefore(dateHint, 7));
    params.set("dateTo", dateDaysBefore(dateHint, -7));
  }
  const res = await fetchGatewayJson("/api/raw-material-returns", params, "production");
  if (res.ok && Array.isArray(res.data?.data)) {
    return res.data.data;
  }

  // Fallback: individual searches if batch failed
  const returns = [];
  for (const ref of cleanRefs) {
    const p = new URLSearchParams({ search: ref, pageSize: "50" });
    const r = await fetchGatewayJson("/api/raw-material-returns", p, "production");
    if (r.ok && r.data?.data?.length) {
      returns.push(...r.data.data);
    }
  }
  return returns;
}

/**
 * Fetch WIP receipts for flour sifting (WK-2202 and WK-2202-1)
 */
export async function fetchFlourReceipts(lotNo, isoDate, skuCode = "WK-2202") {
  const profile = resolveFlourSiftingProfile(skuCode);
  const receiptDates = productionReceiptDateRange(isoDate);
  const params = new URLSearchParams({
    search: profile?.receiptSearch || skuCode || "WK-2202",
    dateFrom: receiptDates.dateFrom,
    dateTo: receiptDates.dateTo,
    pageSize: "50",
  });

  const res = await fetchGatewayJson("/api/production-receipts", params, "production");
  if (!res.ok) {
    throw new ApiError(res.status || 500, res.error?.message || "Failed to fetch production receipts from ERP");
  }

  const allRows = res.data?.data || [];
  const matched = allRows.filter((r) => {
    const rowLot = String(r.LOT_NO || "").trim();
    return rowLot === lotNo || rowLot.startsWith(lotNo);
  });

  return matched;
}

/**
 * Prepare draft calculation for a flour sifting lot
 */
export async function buildFlourCostDraft(lotNo, { skuCode = "", receiptRows = null } = {}) {
  const dateInfo = parseLotToDates(lotNo);
  if (!dateInfo) {
    throw new ApiError(400, `Invalid lot number format: ${lotNo}. Expected YYMMDD.`);
  }

  const normalizedSku = String(skuCode || receiptRows?.[0]?.SKU_CODE || "").replaceAll("-", "").toUpperCase();
  const receiptName = String(receiptRows?.[0]?.SKU_NAME || "").toUpperCase();
  const profile = resolveFlourSiftingProfile(normalizedSku);
  const remarkHint = profile?.remarkHint
    || (["PLD", "D1", "อินทัช"].find((hint) => receiptName.includes(hint.toUpperCase())) || "");
  const [receipts, requisitions] = await Promise.all([
    receiptRows || fetchFlourReceipts(dateInfo.lotPrefix, dateInfo.isoDate, skuCode),
    fetchFlourRequisitionData(dateInfo.thaiDateStr, dateInfo.isoDate, remarkHint),
  ]);

  const reqRefs = [...new Set(requisitions.map((r) => r.DI_REF).filter(Boolean))];
  const returns = await fetchReturnsForRequisitions(reqRefs, dateInfo.isoDate);

  // Group receipts
  // e.g. WK-2202 (22.50 kg) and WK-2202-1 (18.50 kg)
  let totalOutputWeightKg = 0;
  let totalBags = 0;
  const outputProducts = receipts.map((r) => {
    const qty = Number(r.DOC_QTY || 0);
    const netBaseKg = Number(r.NET_BASE_QTY || 0);
    totalOutputWeightKg += netBaseKg;
    totalBags += qty;
    return {
      sku_code: r.SKU_CODE,
      sku_name: r.SKU_NAME,
      lot_no: r.LOT_NO,
      doc_ref: r.DI_REF,
      qty,
      unit_name: r.DOC_UNIT_NAME,
      weight_kg: netBaseKg,
    };
  });

  // Cost per output unit must use a measured receipt. Never infer production
  // output from input quantity because that hides yield loss and overstates stock.
  const effectiveOutputKg = totalOutputWeightKg;

  // Process materials & deduct returns
  const materialItems = [];
  const consumablesItems = [];
  let totalMaterialCost = 0;

  for (let i = 0; i < requisitions.length; i++) {
    const r = requisitions[i];
    const skuCode = String(r.TRD_SH_CODE || "");
    const qty = Number(r.TRD_SH_QTY || 0);
    const unitPrice = Number(r.TRD_SH_UPRC || 0);
    const grossAmt = Number(r.TRD_SH_GAMT || 0);

    // Check if there are returns for this item & ref
    const matchingReturns = returns.filter(
      (ret) => ret.TRD_SH_CODE === skuCode && (ret.DI_REMARK || "").includes(r.DI_REF)
    );
    const returnedQty = matchingReturns.reduce((sum, ret) => sum + Number(ret.TRD_SH_QTY || 0), 0);
    const returnedAmt = matchingReturns.reduce((sum, ret) => sum + Number(ret.TRD_SH_GAMT || 0), 0);

    const netQty = Math.max(0, qty - returnedQty);
    const netAmt = Math.max(0, grossAmt - returnedAmt);

    totalMaterialCost += netAmt;

    const isConsumable = ["U06-0026", "N15-0002", "S02-0005"].some((c) => skuCode.startsWith(c));

    const itemObj = {
      seq: i + 1,
      item_type: isConsumable ? "PACKING" : "RM",
      item_code: skuCode,
      item_name: r.TRD_SH_NAME || "",
      lot_no: r.TRD_LOT_NO || "",
      qty: netQty,
      uom_name: isConsumable ? "หน่วย" : "kg",
      unit_price: unitPrice,
      total_amount: netAmt,
      source_doc_ref: r.DI_REF,
      source_doc_date: r.DI_DATE ? r.DI_DATE.slice(0, 10) : null,
      returned_qty: returnedQty,
      returned_amount: returnedAmt,
      return_doc_refs: [...new Set(matchingReturns.map((ret) => ret.DI_REF).filter(Boolean))],
    };

    if (isConsumable) {
      consumablesItems.push(itemObj);
    } else {
      materialItems.push(itemObj);
    }
  }

  // Cost calculations
  const unitCostPerKg = effectiveOutputKg > 0 ? totalMaterialCost / effectiveOutputKg : 0;
  const costPerBag22_5 = unitCostPerKg * 22.5;
  const costPerBag18_5 = unitCostPerKg * 18.5;

  return {
    lot_no: lotNo,
    production_date: dateInfo.isoDate,
    thai_date_str: dateInfo.thaiDateStr,
    stage_key: "flour_sifting",
    cost_type: "WIP",
    sku_code: outputProducts[0]?.sku_code || "WK-2202",
    sku_name: outputProducts[0]?.sku_name || "แป้งร่อน",
    planned_qty: effectiveOutputKg,
    actual_qty: effectiveOutputKg,
    uom_name: "kg",
    output_products: outputProducts,
    output_weight_kg: effectiveOutputKg,
    total_bags: totalBags,
    material_cost: totalMaterialCost,
    dl_cost: 0,
    overhead_cost: 0,
    total_cost: totalMaterialCost,
    unit_cost: unitCostPerKg,
    cost_per_bag_22_5: costPerBag22_5,
    cost_per_bag_18_5: costPerBag18_5,
    standard_unit_cost: 0,
    variance_pct: null,
    materials: [...materialItems, ...consumablesItems],
    expenses: [
      {
        expense_type: "DL",
        description: "ค่าแรงงานตรง (DL) แผนกร่อนแป้ง",
        qty: null,
        uom_name: "บาท",
        rate: null,
        amount: 0,
        remark: "กรอกเอง หรือดึงตามชิ้นงาน",
      },
      {
        expense_type: "OH",
        description: "ค่าใช้จ่ายการผลิต (Overhead / ค่าไฟ / สิ้นเปลือง)",
        qty: null,
        uom_name: "บาท",
        rate: null,
        amount: 0,
        remark: "กรอกเอง หรือคำนวณตามสูตร",
      },
    ],
    issue_documents: reqRefs,
    return_documents: [...new Set(returns.map((row) => row.DI_REF).filter(Boolean))],
  };
}

export async function enrichFlourProductionReceipts(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const groups = rows.reduce((map, row) => {
    const sku = String(row.SKU_CODE || "").replaceAll("-", "").toUpperCase();
    const lot = String(row.LOT_NO || "").trim();
    if (!lot || !resolveFlourSiftingProfile(sku)) return map;
    map.set(lot, [...(map.get(lot) || []), row]);
    return map;
  }, new Map());
  if (!groups.size) return payload;

  const drafts = new Map((await Promise.all([...groups].map(async ([lotNo, receiptRows]) => {
    try {
      return [lotNo, await buildFlourCostDraft(lotNo, { skuCode: receiptRows[0]?.SKU_CODE, receiptRows })];
    } catch {
      return [lotNo, null];
    }
  }))).filter(([, draft]) => draft?.unit_cost > 0));
  const data = applyMaterialIssueCostToReceipts(rows, drafts);
  const summary = Number(payload?.pagination?.totalPages || 1) === 1
    ? { ...payload.summary, totalAmountExclVat: data.reduce((sum, row) => sum + Number(row.NET_AMOUNT_EXCL_VAT || 0), 0) }
    : payload.summary;
  return { ...payload, data, summary };
}

/**
 * List cost sheets from Supabase with summary cards
 */
export async function listCostSheets({
  search = "",
  dateFrom = null,
  dateTo = null,
  costType = null,
  stageKey = null,
  status = null,
  page = 1,
  pageSize = 20,
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("production_cost_sheets")
    .select("*", { count: "exact" });

  if (search) {
    query = query.or(
      `cost_no.ilike.%${search}%,sku_code.ilike.%${search}%,sku_name.ilike.%${search}%,lot_no.ilike.%${search}%,master_plan_no.ilike.%${search}%`
    );
  }
  if (dateFrom) query = query.gte("production_date", dateFrom);
  if (dateTo) query = query.lte("production_date", dateTo);
  if (costType) query = query.eq("cost_type", costType);
  if (stageKey) query = query.eq("stage_key", stageKey);
  if (status) query = query.eq("status", status);

  query = query.order("production_date", { ascending: false }).order("created_at", { ascending: false });

  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data: rows, count, error } = await query;
  if (error) throw new ApiError(500, error.message);

  // Compute summary metrics across all cost sheets (or filtered date range)
  let summaryQuery = supabase
    .from("production_cost_sheets")
    .select("status, total_cost");
  if (dateFrom) summaryQuery = summaryQuery.gte("production_date", dateFrom);
  if (dateTo) summaryQuery = summaryQuery.lte("production_date", dateTo);

  const { data: summaryRows } = await summaryQuery;
  const allRows = summaryRows || [];

  const summary = {
    total_orders: allRows.length,
    closed_count: allRows.filter((r) => r.status === "closed").length,
    pending_count: allRows.filter((r) => r.status === "draft").length,
    problem_count: allRows.filter((r) => r.status === "problem").length,
    total_actual_cost: allRows.reduce((sum, r) => sum + Number(r.total_cost || 0), 0),
  };

  return {
    data: rows || [],
    summary,
    pagination: {
      page,
      pageSize,
      totalRecords: count || 0,
      totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
    },
  };
}

/**
 * Get cost sheet by ID with materials, expenses, and linked sheets
 */
export async function getCostSheetById(id) {
  const supabase = getSupabaseAdmin();

  const { data: sheet, error: sheetError } = await supabase
    .from("production_cost_sheets")
    .select("*")
    .eq("id", id)
    .single();

  if (sheetError || !sheet) {
    throw new ApiError(404, "Cost sheet not found");
  }

  const [{ data: materials }, { data: expenses }] = await Promise.all([
    supabase
      .from("production_cost_sheet_items")
      .select("*, linked_cost_sheet:linked_cost_sheet_id(*)")
      .eq("cost_sheet_id", id)
      .order("seq", { ascending: true }),
    supabase
      .from("production_cost_sheet_expenses")
      .select("*")
      .eq("cost_sheet_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    ...sheet,
    materials: materials || [],
    expenses: expenses || [],
  };
}

/**
 * Save / Upsert cost sheet (draft or closed)
 */
export async function saveCostSheet(payload, user) {
  const supabase = getSupabaseAdmin();

  const {
    id,
    cost_no,
    cost_type = "WIP",
    stage_key = "flour_sifting",
    sku_code,
    sku_name,
    lot_no,
    production_date,
    master_plan_no = null,
    department_code = null,
    department_name = null,
    status = "draft",
    planned_qty = 0,
    actual_qty = 0,
    actual_weight_kg = null,
    uom_name = "kg",
    waste_qty = 0,
    waste_rate_pct = 0,
    baking_yield_pct = null,
    standard_unit_cost = 0,
    notes = null,
    materials = [],
    expenses = [],
  } = payload;

  if (!sku_code || !lot_no || !production_date) {
    throw new ApiError(400, "sku_code, lot_no, and production_date are required");
  }
  if (
    materials.some((item) => !Number.isFinite(Number(item.qty)) || Number(item.qty) < 0 ||
      !Number.isFinite(Number(item.total_amount)) || Number(item.total_amount) < 0) ||
    expenses.some((item) => !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0)
  ) {
    throw new ApiError(400, "Cost quantities and amounts must be valid non-negative numbers");
  }

  const resolvedExpenses = [...expenses];
  if (!resolvedExpenses.some((item) => item.expense_type === "DL")) {
    const labor = await loadPieceRateLaborSummary(supabase, sku_code, lot_no);
    if (labor.amount > 0) {
      resolvedExpenses.push({
        expense_type: "DL",
        description: "ค่าแรงงานตรงจากบันทึกชิ้นงาน",
        amount: labor.amount,
        uom_name: "บาท",
        is_auto_fetched: true,
        remark: `${labor.documentCount} เอกสาร · ${labor.employeeCount} คน`,
      });
    }
  }

  if (status === "closed") {
    const linkedIds = [...new Set(materials
      .filter((item) => item.item_type === "WIP" && item.linked_cost_sheet_id)
      .map((item) => item.linked_cost_sheet_id))];
    let linkedSheetStatusById = {};
    if (linkedIds.length) {
      const { data: linkedSheets, error: linkedError } = await supabase
        .from("production_cost_sheets")
        .select("id,status")
        .in("id", linkedIds);
      if (linkedError) throw new ApiError(500, linkedError.message);
      linkedSheetStatusById = Object.fromEntries((linkedSheets || []).map((row) => [row.id, row.status]));
    }
    const closeErrors = validateCostSheetClose({
      actualQty: actual_qty,
      materials,
      expenses: resolvedExpenses,
      linkedSheetStatusById,
    });
    if (master_plan_no) {
      const allocationPreview = await buildBomAllocationPreview({
        masterPlanNo: master_plan_no,
        productionDate: production_date,
        skuCode: sku_code,
      });
      closeErrors.push(...validateCentralAllocation({
        skuCode: sku_code,
        materials,
        preview: allocationPreview,
      }));
    }
    if (closeErrors.length) throw new ApiError(400, closeErrors[0], { errors: closeErrors });
  }

  if (id) {
    const { data: existing, error: existingError } = await supabase
      .from("production_cost_sheets")
      .select("status")
      .eq("id", id)
      .single();
    if (existingError || !existing) throw new ApiError(404, "Cost sheet not found");
    if (existing.status === "closed") {
      throw new ApiError(409, "Closed cost sheets are immutable; reopen with an audited adjustment first");
    }
  }

  // Calculate material cost
  const materialCost = materials.reduce((sum, m) => sum + Number(m.total_amount || 0), 0);

  // Calculate DL and OH costs from expenses
  let dlCost = 0;
  let ohCost = 0;
  resolvedExpenses.forEach((e) => {
    const amt = Number(e.amount || 0);
    if (e.expense_type === "DL") dlCost += amt;
    else if (e.expense_type === "OH") ohCost += amt;
  });

  const totalCost = materialCost + dlCost + ohCost;
  const unitCost = Number(actual_qty) > 0 ? totalCost / Number(actual_qty) : 0;
  const stdCost = Number(standard_unit_cost) || 0;
  const variancePct = stdCost > 0 ? ((unitCost - stdCost) / stdCost) * 100 : 0;

  const generatedCostNo =
    cost_no ||
    `CS-${cost_type}-${lot_no}-${Date.now().toString().slice(-4)}`;

  const sheetData = {
    cost_no: generatedCostNo,
    cost_type,
    stage_key,
    sku_code,
    sku_name,
    lot_no,
    production_date,
    master_plan_no,
    department_code,
    department_name,
    status,
    planned_qty: Number(planned_qty) || 0,
    actual_qty: Number(actual_qty) || 0,
    actual_weight_kg: actual_weight_kg == null ? null : Number(actual_weight_kg) || 0,
    uom_name,
    waste_qty: Number(waste_qty) || 0,
    waste_rate_pct: Number(waste_rate_pct) || 0,
    baking_yield_pct: baking_yield_pct != null ? Number(baking_yield_pct) : null,
    material_cost: materialCost,
    dl_cost: dlCost,
    overhead_cost: ohCost,
    total_cost: totalCost,
    unit_cost: unitCost,
    standard_unit_cost: stdCost,
    variance_pct: variancePct,
    notes,
    updated_at: new Date().toISOString(),
  };

  if (status === "closed") {
    sheetData.closed_at = new Date().toISOString();
    sheetData.closed_by = user?.name || user?.email || "Admin";
  }

  let savedSheetId = id;

  if (id) {
    const { error: updateError } = await supabase
      .from("production_cost_sheets")
      .update(sheetData)
      .eq("id", id);
    if (updateError) throw new ApiError(500, updateError.message);
  } else {
    const { data: newSheet, error: insertError } = await supabase
      .from("production_cost_sheets")
      .insert(sheetData)
      .select("id")
      .single();
    if (insertError) throw new ApiError(500, insertError.message);
    savedSheetId = newSheet.id;
  }

  // Replace material items
  if (materials.length > 0 || id) {
    await supabase.from("production_cost_sheet_items").delete().eq("cost_sheet_id", savedSheetId);

    const itemRows = materials.map((m, index) => ({
      cost_sheet_id: savedSheetId,
      seq: index + 1,
      item_type: m.item_type || "RM",
      item_code: m.item_code,
      item_name: m.item_name,
      lot_no: m.lot_no || null,
      qty: Number(m.qty) || 0,
      uom_name: m.uom_name || "kg",
      unit_price: Number(m.unit_price) || 0,
      total_amount: Number(m.total_amount) || 0,
      source_doc_ref: m.source_doc_ref || null,
      source_doc_date: m.source_doc_date || null,
      linked_cost_sheet_id: m.linked_cost_sheet_id || null,
      bom_qty: m.bom_qty != null ? Number(m.bom_qty) : null,
      issued_qty: m.issued_qty != null ? Number(m.issued_qty) : null,
      allocation_status: m.allocation_status || (
        Number(m.qty) > 0
        && Number(m.unit_price) > 0
        && String(m.source_doc_ref || "").trim()
        && (!["RM", "WIP", "MANUAL_WIP"].includes(m.item_type) || String(m.lot_no || "").trim())
        && (m.item_type !== "WIP" || m.linked_cost_sheet_id)
          ? "confirmed"
          : "pending"
      ),
      exception_reason: m.exception_reason || null,
      source_kind: m.source_kind || null,
    }));

    if (itemRows.length > 0) {
      const { error: itemsError } = await supabase.from("production_cost_sheet_items").insert(itemRows);
      if (itemsError) throw new ApiError(500, itemsError.message);
    }
  }

  // Replace expenses
  if (resolvedExpenses.length > 0 || id) {
    await supabase.from("production_cost_sheet_expenses").delete().eq("cost_sheet_id", savedSheetId);

    const expenseRows = resolvedExpenses.map((e) => ({
      cost_sheet_id: savedSheetId,
      expense_type: e.expense_type || "DL",
      description: e.description,
      qty: e.qty != null ? Number(e.qty) : null,
      uom_name: e.uom_name || null,
      rate: e.rate != null ? Number(e.rate) : null,
      amount: Number(e.amount) || 0,
      remark: e.remark || null,
      is_auto_fetched: Boolean(e.is_auto_fetched),
    }));

    if (expenseRows.length > 0) {
      const { error: expError } = await supabase.from("production_cost_sheet_expenses").insert(expenseRows);
      if (expError) throw new ApiError(500, expError.message);
    }
  }

  return getCostSheetById(savedSheetId);
}

export async function listMaterialEstimateProducts() {
  const db = getSupabaseAdmin();
  const { data: boms, error: bomError } = await db
    .from("production_boms")
    .select("id,sku_code")
    .order("sku_code");
  if (bomError) throw new ApiError(500, bomError.message);
  if (!boms?.length) return [];

  const { data: versions, error: versionError } = await db
    .from("production_bom_versions")
    .select("bom_id")
    .in("bom_id", boms.map((row) => row.id))
    .eq("status", "approved")
    .or("formula_code.eq.DEFAULT,formula_code.is.null")
    .is("deleted_at", null);
  if (versionError) throw new ApiError(500, versionError.message);
  const approvedBomIds = new Set((versions || []).map((row) => row.bom_id));
  const approvedBoms = boms.filter((row) => approvedBomIds.has(row.id));
  if (!approvedBoms.length) return [];

  const { data: products, error: productError } = await db
    .from("products_cache")
    .select("sku_code,sku_name,uom_name")
    .in("sku_code", approvedBoms.map((row) => row.sku_code))
    .order("sku_code");
  if (productError) throw new ApiError(500, productError.message);
  return products || [];
}

export async function buildMaterialCostEstimate({ skuCode, plannedQty, estimateDate }) {
  const normalizedSku = String(skuCode || "").trim().toUpperCase();
  const quantity = Number(plannedQty);
  if (!normalizedSku) throw new ApiError(400, "กรุณาเลือกสินค้า");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(400, "จำนวนผลิตต้องมากกว่า 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(estimateDate || ""))) throw new ApiError(400, "วันที่ประมาณการไม่ถูกต้อง");

  const db = getSupabaseAdmin();
  const { data: product, error: productError } = await db
    .from("products_cache")
    .select("sku_code,sku_name,uom_name")
    .eq("sku_code", normalizedSku)
    .maybeSingle();
  if (productError) throw new ApiError(500, productError.message);
  if (!product) throw new ApiError(404, "ไม่พบสินค้า");

  const explosionRows = await explodeBomBatch(db, [{
    planId: "MATERIAL-ESTIMATE",
    skuCode: normalizedSku,
    plannedQty: quantity,
    formulaCode: "DEFAULT",
  }]);
  const rawRows = explosionRows.filter((row) => row.itemType === "RAW");
  if (!rawRows.length) throw new ApiError(404, "ไม่พบวัตถุดิบใน BOM ที่อนุมัติแล้ว");

  const materialSkuCodes = [...new Set(rawRows.map((row) => row.materialSkuCode).filter(Boolean))];
  const materialGoodsCodes = [...new Set(rawRows.map((row) => row.materialGoodsCode).filter(Boolean))];
  const [receiptResult, tradeCodeResult] = await Promise.all([
    fetchGatewayJson("/api/raw-material-receipts", new URLSearchParams({
      skuCodes: materialSkuCodes.join(","),
      dateTo: estimateDate,
      latestOnly: "1",
      pageSize: "500",
    }), "production"),
    fetchGatewayJson("/api/trade-codes", new URLSearchParams({
      goodsCodes: materialGoodsCodes.join(","),
      pageSize: "500",
    }), "production"),
  ]);
  if (!receiptResult.ok) throw new ApiError(receiptResult.status || 502, receiptResult.error?.message || "โหลดราคาวัตถุดิบไม่สำเร็จ");
  if (!tradeCodeResult.ok) throw new ApiError(tradeCodeResult.status || 502, tradeCodeResult.error?.message || "โหลดหน่วย Trade Code ไม่สำเร็จ");

  const rows = buildMaterialEstimateRows({
    explosionRows: rawRows,
    receiptRows: receiptResult.data?.data || [],
    tradeCodeRows: tradeCodeResult.data?.data || [],
    estimateDate,
  });
  return {
    product,
    plannedQty: quantity,
    estimateDate,
    priceBasis: "ราคาล่าสุดจากใบรับเข้าวัตถุดิบ ณ วันที่ประมาณการ (ไม่รวม VAT)",
    rows,
    totalMaterialCost: rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0),
    pricedCount: rows.filter((row) => row.unitPrice != null).length,
    missingCount: rows.filter((row) => row.unitPrice == null).length,
  };
}
