import "server-only";

import { fetchGatewayJson } from "@/lib/gatewayClient";
import {
  aggregateMaterialDemand,
  aggregateMaterialDemandByDepartment,
  claimTableName,
  demandSourceLabel,
  buildMaterialSourceRowKey,
  loadClaimMap,
  MATERIAL_DEMAND_SOURCES,
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeDemandSource,
  normalizeSku,
  toClaimKey,
} from "@/lib/materialClaims";
import {
  buildDirectSubplanSnapshot,
  buildRecursiveSubplanSnapshot,
  chooseApprovedVersionForPlan,
  loadApprovedBomVersionsBySku,
} from "@/lib/subplanSnapshots";
import {
  explodeRawRequirementsFromWipLines,
  loadMainPlanRowsForMasterPlan,
} from "@/lib/wipPlanning";

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "PGRST204" || message.includes(String(columnName || "").toLowerCase());
}

export async function loadMaterialUnitMapFromSummary(materialCodes = []) {
  const codes = Array.from(
    new Set((materialCodes || []).map((item) => normalizeSku(item)).filter(Boolean))
  );
  if (!codes.length) return new Map();

  const rows = [];
  for (let index = 0; index < codes.length; index += 80) {
    const params = new URLSearchParams();
    params.set("skus", codes.slice(index, index + 80).join(","));
    const result = await fetchGatewayJson(
      "/api/raw-materials-summary-by-skus",
      params,
      "production"
    );
    if (!result.ok) continue;
    rows.push(...(Array.isArray(result.data?.data) ? result.data.data : []));
  }
  const map = new Map();
  rows.forEach((row) => {
    const skuCode = normalizeSku(row?.SKU_CODE);
    if (!skuCode) return;
    const unit =
      String(row?.TRD_UTQNAME || "").trim()
      || String(row?.UTQ_NAME || "").trim()
      || String(row?.UTQ_NAME_1 || "").trim()
      || "";
    if (!unit) return;
    map.set(skuCode, unit);
  });
  return map;
}

export async function loadMaterialUnitMapFromTradeCodes(materialCodes = []) {
  const tradeCodeMap = await loadMaterialTradeCodeMap(materialCodes);
  const unitMap = new Map();
  tradeCodeMap.forEach((value, key) => {
    const unit = String(value?.unit || "").trim();
    if (!unit) return;
    unitMap.set(key, unit);
  });
  return unitMap;
}

export async function loadMaterialTradeCodeMap(materialCodes = []) {
  const codes = Array.from(
    new Set((materialCodes || []).map((item) => normalizeSku(item)).filter(Boolean))
  );
  if (!codes.length) return new Map();

  const results = await Promise.all(
    codes.map(async (code) => {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("pageSize", "100");
      params.set("search", code);

      const result = await fetchGatewayJson("/api/trade-codes", params, "static");
      if (!result.ok) return null;

      const rows = Array.isArray(result.data?.data) ? result.data.data : [];
      const exactGoodsMatch = rows.find(
        (row) => normalizeSku(row?.GOODS_CODE) === code
      );
      const exactSkuMatch = rows.find(
        (row) => normalizeSku(row?.SKU_CODE) === code
      );
      const exactMatch = exactGoodsMatch || exactSkuMatch;
      if (!exactMatch) return [code, null];

      const unit =
        String(exactMatch?.UTQ_NAME_2 || "").trim()
        || String(exactMatch?.UTQ_NAME_1 || "").trim()
        || String(exactMatch?.UTQ_NAME || "").trim()
        || "";

      return [
        code,
        {
          goodsCode: normalizeSku(exactMatch?.GOODS_CODE),
          skuCode: normalizeSku(exactMatch?.SKU_CODE),
          unit,
          name: String(exactMatch?.SKU_NAME || "").trim() || code,
        },
      ];
    })
  );

  const map = new Map();
  results.forEach((entry) => {
    if (!entry || !entry[1]) return;
    map.set(entry[0], entry[1]);
  });
  return map;
}

async function loadMaterialStockMap(materialSkuCodes = []) {
  const codes = Array.from(
    new Set((materialSkuCodes || []).map((item) => normalizeSku(item)).filter(Boolean))
  );
  if (!codes.length) return new Map();

  const params = new URLSearchParams();
  params.set("skus", codes.join(","));

  const result = await fetchGatewayJson(
    "/api/raw-materials-summary-by-skus",
    params,
    "production"
  );
  if (!result.ok) return new Map();

  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  const map = new Map();
  rows.forEach((row) => {
    const skuCode = normalizeSku(row?.SKU_CODE);
    if (!skuCode) return;
    map.set(skuCode, {
      qty: Number(row?.QTY) || 0,
      unit:
        String(row?.UTQ_NAME || "").trim()
        || String(row?.UTQ_NAME_1 || "").trim()
        || "",
      name: String(row?.SKU_NAME || "").trim() || skuCode,
    });
  });
  return map;
}

export async function loadSubplanRowsForClaimDemand(supabaseAdmin, options = {}) {
  const masterPlanNo = String(options?.masterPlanNo || "").trim().toUpperCase();
  const dateFrom = normalizeDateOnly(options?.dateFrom);
  const dateTo = normalizeDateOnly(options?.dateTo);
  if (!masterPlanNo) return [];

  let query = supabaseAdmin
    .from("production_plan_status")
    .select(
      `plan_id,period_start,bom_snapshot,status,confirmed_at,owner_department_id,master_plan_no,plan_kind,sub_plan_no,
      sku_code,sku_name,planned_qty,unit,formula_code,formula_name,bom_version_id,schedule_section_def_id,schedule_section_name,shift_id,shift_code,shift_name,
      production_departments:owner_department_id(code,name)`
    )
    .eq("master_plan_no", masterPlanNo)
    .eq("plan_kind", "sub");

  if (dateFrom) query = query.gte("period_start", dateFrom);
  if (dateTo) query = query.lte("period_start", dateTo);

  let result = await query;
  if (
    result.error
    && (
      isMissingColumnError(result.error, "shift_id")
      || isMissingColumnError(result.error, "shift_code")
      || isMissingColumnError(result.error, "shift_name")
    )
  ) {
    let fallbackQuery = supabaseAdmin
      .from("production_plan_status")
      .select(
        `plan_id,period_start,bom_snapshot,status,confirmed_at,owner_department_id,master_plan_no,plan_kind,sub_plan_no,
        sku_code,sku_name,planned_qty,unit,formula_code,formula_name,bom_version_id,schedule_section_def_id,schedule_section_name,
        production_departments:owner_department_id(code,name)`
      )
      .eq("master_plan_no", masterPlanNo)
      .eq("plan_kind", "sub");

    if (dateFrom) fallbackQuery = fallbackQuery.gte("period_start", dateFrom);
    if (dateTo) fallbackQuery = fallbackQuery.lte("period_start", dateTo);
    result = await fallbackQuery;
  }
  const { data, error } = result;
  if (error) {
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return [];

  const rowsToRebuild = rows.filter((row) => {
    const root = Array.isArray(row?.bom_snapshot) ? row.bom_snapshot[0] : null;
    const source = String(root?.source || "").trim().toLowerCase();
    return source !== "subplan_confirm_recursive" && source !== "claim_pool_subplan_recursive";
  });
  if (!rowsToRebuild.length) {
    return rows;
  }

  const explosionResult = await explodeRawRequirementsFromWipLines(
    supabaseAdmin,
    rowsToRebuild.map((row) => ({
      planId: row?.plan_id,
      skuCode: row?.sku_code,
      plannedQty: row?.planned_qty,
      formulaCode: row?.formula_code,
      bomVersionId: row?.bom_version_id,
    }))
  );
  const explodedByPlanId = explosionResult?.byPlanId instanceof Map
    ? explosionResult.byPlanId
    : new Map();
  const nowIso = new Date().toISOString();

  return rows.map((row) => {
    const root = Array.isArray(row?.bom_snapshot) ? row.bom_snapshot[0] : null;
    const source = String(root?.source || "").trim().toLowerCase();
    if (source === "subplan_confirm_recursive" || source === "claim_pool_subplan_recursive") {
      return row;
    }
    const planId = String(row?.plan_id || "").trim();
    const snapshot = buildRecursiveSubplanSnapshot(
      row,
      explodedByPlanId.get(planId) || [],
      nowIso,
      { source: "claim_pool_subplan_recursive" }
    );
    return {
      ...row,
      bom_snapshot: snapshot ? [snapshot] : [],
    };
  });
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildMainPlanHeadcountKeys(row) {
  const departmentId = String(row?.owner_department_id || "").trim();
  const sectionId = String(row?.schedule_section_def_id || row?.workstream_code || "").trim();
  const shiftCode = String(row?.shift_code || row?.shiftCode || row?.shift_id || row?.shiftId || "").trim().toUpperCase();
  const workDate = normalizeDateOnly(row?.period_start);
  const skuCode = normalizeSku(row?.sku_code);
  const plannedQty = toRounded(row?.planned_qty, 6);
  return [
    [departmentId, sectionId, shiftCode, workDate, skuCode, plannedQty].join("|"),
    [departmentId, shiftCode, workDate, skuCode, plannedQty].join("|"),
    [sectionId, shiftCode, workDate, skuCode, plannedQty].join("|"),
    [shiftCode, workDate, skuCode, plannedQty].join("|"),
    [departmentId, sectionId, workDate, skuCode, plannedQty].join("|"),
    [departmentId, workDate, skuCode, plannedQty].join("|"),
    [sectionId, workDate, skuCode, plannedQty].join("|"),
    [workDate, skuCode, plannedQty].join("|"),
  ].filter((key, index, list) => key && list.indexOf(key) === index);
}

function mergeMissingMainPlanHeadcount(rows = [], fallbackRows = []) {
  if (!rows.length || !fallbackRows.length) return rows;

  const fallbackByKey = new Map();
  fallbackRows.forEach((row) => {
    const counts = {
      lineStaffCount: toPositiveNumber(row?.line_staff_count ?? row?.lineStaffCount),
      lineMachineNo: toPositiveNumber(row?.line_machine_no ?? row?.lineMachineNo),
      lineDoughSetCount: toPositiveNumber(row?.line_dough_set_count ?? row?.lineDoughSetCount),
    };
    if (!counts.lineStaffCount && !counts.lineMachineNo && !counts.lineDoughSetCount) return;
    buildMainPlanHeadcountKeys(row).forEach((key) => {
      if (!fallbackByKey.has(key)) fallbackByKey.set(key, counts);
    });
  });

  return rows.map((row) => {
    const matched = buildMainPlanHeadcountKeys(row)
      .map((key) => fallbackByKey.get(key))
      .find(Boolean);
    if (!matched) return row;
    return {
      ...row,
      line_staff_count: toPositiveNumber(row?.line_staff_count ?? row?.lineStaffCount)
        || matched.lineStaffCount
        || row?.line_staff_count,
      line_machine_no: toPositiveNumber(row?.line_machine_no ?? row?.lineMachineNo)
        || matched.lineMachineNo
        || row?.line_machine_no,
      line_dough_set_count: toPositiveNumber(row?.line_dough_set_count ?? row?.lineDoughSetCount)
        || matched.lineDoughSetCount
        || row?.line_dough_set_count,
    };
  });
}

export async function loadMainPlanRowsForClaimDemand(supabaseAdmin, options = {}) {
  const masterPlanNo = String(options?.masterPlanNo || "").trim().toUpperCase();
  const dateFrom = normalizeDateOnly(options?.dateFrom);
  const dateTo = normalizeDateOnly(options?.dateTo);
  const includeWipMaterials = options?.includeWipMaterials === true;
  if (!masterPlanNo) return [];

  let rows = [];
  let statusResult = await supabaseAdmin
    .from("production_plan_status")
    .select(`
      plan_id,sku_code,sku_name,planned_qty,unit,period_start,period_end,formula_code,formula_name,
      bom_version_id,line_staff_count,line_machine_no,line_dough_set_count,schedule_section_def_id,schedule_section_name,owner_department_id,shift_id,shift_code,shift_name,
      production_departments:owner_department_id(code,name)
    `)
    .eq("master_plan_no", masterPlanNo)
    .eq("plan_kind", "main")
    .order("period_start", { ascending: true });
  if (
    statusResult.error
    && (
      isMissingColumnError(statusResult.error, "shift_id")
      || isMissingColumnError(statusResult.error, "shift_code")
      || isMissingColumnError(statusResult.error, "shift_name")
    )
  ) {
    statusResult = await supabaseAdmin
      .from("production_plan_status")
      .select(`
        plan_id,sku_code,sku_name,planned_qty,unit,period_start,period_end,formula_code,formula_name,
        bom_version_id,line_staff_count,line_machine_no,line_dough_set_count,schedule_section_def_id,schedule_section_name,owner_department_id,
        production_departments:owner_department_id(code,name)
      `)
      .eq("master_plan_no", masterPlanNo)
      .eq("plan_kind", "main")
      .order("period_start", { ascending: true });
  }
  if (!statusResult.error) {
    rows = Array.isArray(statusResult.data) ? statusResult.data : [];
  }
  let fallbackRows = [];
  if (!rows.length || rows.some((row) => !toPositiveNumber(row?.line_staff_count ?? row?.lineStaffCount))) {
    fallbackRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
  }
  if (rows.length) {
    rows = mergeMissingMainPlanHeadcount(rows, fallbackRows);
  } else {
    rows = fallbackRows;
  }
  if (dateFrom || dateTo) {
    rows = rows.filter((row) => {
      const workDate = normalizeDateOnly(row?.period_start);
      if (!workDate) return false;
      if (dateFrom && workDate < dateFrom) return false;
      if (dateTo && workDate > dateTo) return false;
      return true;
    });
  }
  if (!rows.length) return [];

  const versionsBySku = await loadApprovedBomVersionsBySku(
    supabaseAdmin,
    rows.map((row) => row?.sku_code)
  );
  const nowIso = new Date().toISOString();

  return rows
    .map((row) => {
      const versions = versionsBySku.get(normalizeSku(row?.sku_code)) || [];
      const selectedVersion = chooseApprovedVersionForPlan(row, versions);
      const snapshot = buildDirectSubplanSnapshot(
        row,
        selectedVersion,
        nowIso,
        { source: "claim_pool_fg_direct" }
      );
      const directMaterials = Array.isArray(snapshot?.materials)
        ? snapshot.materials.filter((material) => {
          const itemType = String(material?.itemType || "").trim().toUpperCase();
          return itemType === "RAW" || (includeWipMaterials && itemType === "WIP");
        })
        : [];
      if (!selectedVersion || !directMaterials.length) return null;

      snapshot.materials = directMaterials;

      return {
        ...row,
        demand_source: MATERIAL_DEMAND_SOURCES.FG_DIRECT,
        bom_snapshot: [snapshot],
      };
    })
    .filter(Boolean);
}

function toRounded(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
}

function buildTotalsByBucket(rows = []) {
  const byBucket = new Map();
  (rows || []).forEach((row) => {
    const bucketDate = normalizeDateOnly(row?.bucketDate);
    if (!bucketDate) return;
    const key = bucketDate;
    if (!byBucket.has(key)) {
      byBucket.set(key, {
        bucketDate,
        issueQty: 0,
        requiredQty: 0,
        departmentIds: new Set(),
        materialSkuCodes: new Set(),
        sourcePlanIds: new Set(),
      });
    }
    const target = byBucket.get(key);
    target.issueQty += Number(row?.issueQty || 0);
    target.requiredQty += Number(row?.requiredQty || 0);
    const departmentId = String(row?.departmentId || "").trim();
    if (departmentId) target.departmentIds.add(departmentId);
    const materialSkuCode = normalizeSku(row?.materialSkuCode);
    const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
    if (materialSkuCode) target.materialSkuCodes.add(materialSkuCode);
    if (materialGoodsCode) target.materialSkuCodes.add(materialGoodsCode);
    (row?.sourcePlanIds || []).forEach((planId) => {
      const normalizedPlanId = String(planId || "").trim();
      if (normalizedPlanId) target.sourcePlanIds.add(normalizedPlanId);
    });
  });
  return Array.from(byBucket.values())
    .map((row) => ({
      bucketDate: row.bucketDate,
      issueQty: toRounded(row.issueQty),
      requiredQty: toRounded(row.requiredQty),
      departmentCount: row.departmentIds.size,
      materialSkuCount: row.materialSkuCodes.size,
      sourcePlanCount: row.sourcePlanIds.size,
    }))
    .sort((a, b) => String(a.bucketDate || "").localeCompare(String(b.bucketDate || "")));
}

function buildRowsByBucketDepartment(rows = []) {
  const byKey = new Map();
  (rows || []).forEach((row) => {
    const bucketDate = normalizeDateOnly(row?.bucketDate);
    if (!bucketDate) return;
    const departmentId = String(row?.departmentId || "").trim() || "UNASSIGNED";
    const key = `${bucketDate}|${departmentId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        bucketDate,
        departmentId,
        departmentCode: String(row?.departmentCode || "").trim().toUpperCase() || null,
        departmentName: String(row?.departmentName || "").trim() || null,
        issueQty: 0,
        requiredQty: 0,
        materialSkuCodes: new Set(),
        sourcePlanIds: new Set(),
      });
    }
    const target = byKey.get(key);
    target.issueQty += Number(row?.issueQty || 0);
    target.requiredQty += Number(row?.requiredQty || 0);
    const materialSkuCode = normalizeSku(row?.materialSkuCode);
    const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
    if (materialSkuCode) target.materialSkuCodes.add(materialSkuCode);
    if (materialGoodsCode) target.materialSkuCodes.add(materialGoodsCode);
    (row?.sourcePlanIds || []).forEach((planId) => {
      const normalizedPlanId = String(planId || "").trim();
      if (normalizedPlanId) target.sourcePlanIds.add(normalizedPlanId);
    });
  });
  return Array.from(byKey.values())
    .map((row) => ({
      bucketDate: row.bucketDate,
      departmentId: row.departmentId,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      issueQty: toRounded(row.issueQty),
      requiredQty: toRounded(row.requiredQty),
      materialSkuCount: row.materialSkuCodes.size,
      sourcePlanCount: row.sourcePlanIds.size,
    }))
    .sort((a, b) => {
      const dateCompare = String(a.bucketDate || "").localeCompare(String(b.bucketDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.departmentCode || a.departmentId || "").localeCompare(
        String(b.departmentCode || b.departmentId || "")
      );
    });
}

function buildTotalsByDepartment(rows = []) {
  const byDept = new Map();
  (rows || []).forEach((row) => {
    const departmentId = String(row?.departmentId || "").trim() || "UNASSIGNED";
    if (!byDept.has(departmentId)) {
      byDept.set(departmentId, {
        departmentId,
        departmentCode: String(row?.departmentCode || "").trim().toUpperCase() || null,
        departmentName: String(row?.departmentName || "").trim() || null,
        issueQty: 0,
        requiredQty: 0,
        materialSkuCodes: new Set(),
        bucketDates: new Set(),
        sourcePlanIds: new Set(),
      });
    }
    const target = byDept.get(departmentId);
    target.issueQty += Number(row?.issueQty || 0);
    target.requiredQty += Number(row?.requiredQty || 0);
    const materialSkuCode = normalizeSku(row?.materialSkuCode);
    const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
    if (materialSkuCode) target.materialSkuCodes.add(materialSkuCode);
    if (materialGoodsCode) target.materialSkuCodes.add(materialGoodsCode);
    const bucketDate = normalizeDateOnly(row?.bucketDate);
    if (bucketDate) target.bucketDates.add(bucketDate);
    (row?.sourcePlanIds || []).forEach((planId) => {
      const normalizedPlanId = String(planId || "").trim();
      if (normalizedPlanId) target.sourcePlanIds.add(normalizedPlanId);
    });
  });

  return Array.from(byDept.values())
    .map((row) => ({
      departmentId: row.departmentId,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      issueQty: toRounded(row.issueQty),
      requiredQty: toRounded(row.requiredQty),
      materialSkuCount: row.materialSkuCodes.size,
      bucketCount: row.bucketDates.size,
      sourcePlanCount: row.sourcePlanIds.size,
    }))
    .sort((a, b) => {
      const qtyCompare = Number(b.issueQty || 0) - Number(a.issueQty || 0);
      if (qtyCompare !== 0) return qtyCompare;
      return String(a.departmentCode || a.departmentId || "").localeCompare(
        String(b.departmentCode || b.departmentId || "")
      );
    });
}

function buildDemandAnalytics(planRows = []) {
  const dailyRows = aggregateMaterialDemandByDepartment(planRows, { grain: "daily" });
  const weeklyRows = aggregateMaterialDemandByDepartment(planRows, { grain: "weekly" });
  return {
    daily: {
      totals: buildTotalsByBucket(dailyRows),
      byDepartment: buildRowsByBucketDepartment(dailyRows),
    },
    weekly: {
      totals: buildTotalsByBucket(weeklyRows),
      byDepartment: buildRowsByBucketDepartment(weeklyRows),
    },
    range: {
      totalsByDepartment: buildTotalsByDepartment(dailyRows),
    },
  };
}

async function loadDepartmentMapByIds(supabaseAdmin, departmentIds = []) {
  const ids = Array.from(
    new Set((departmentIds || []).map((item) => String(item || "").trim()).filter(Boolean))
  );
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("production_departments")
    .select("id,code,name,is_active,deleted_at")
    .in("id", ids);
  if (error) return new Map();
  const map = new Map();
  (data || []).forEach((row) => {
    const id = String(row?.id || "").trim();
    if (!id) return;
    map.set(id, row);
  });
  return map;
}

async function loadClaimRowsForDateRange(supabaseAdmin, options = {}) {
  const masterPlanNo = String(options?.masterPlanNo || "").trim().toUpperCase();
  const grain = normalizeClaimGrain(options?.grain, "daily");
  const dateFrom = normalizeDateOnly(options?.dateFrom);
  const dateTo = normalizeDateOnly(options?.dateTo);
  if (!masterPlanNo) return [];

  const table = claimTableName(grain);
  const dateColumn = grain === "weekly" ? "week_start_date" : "work_date";

  let query = supabaseAdmin
    .from(table)
    .select(`id,master_plan_no,material_sku_code,material_goods_code,owner_department_id,demand_source,${dateColumn},department_id,status,source,note,claimed_by,claimed_at,override_issue_qty`)
    .eq("master_plan_no", masterPlanNo);

  if (dateFrom) query = query.gte(dateColumn, dateFrom);
  if (dateTo) query = query.lte(dateColumn, dateTo);

  const { data, error } = await query;
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

export async function buildClaimPoolRows(supabaseAdmin, options = {}) {
  const masterPlanNo = String(options?.masterPlanNo || "").trim().toUpperCase();
  const grain = normalizeClaimGrain(options?.grain, "daily");
  const dateFrom = normalizeDateOnly(options?.dateFrom);
  const dateTo = normalizeDateOnly(options?.dateTo);

  const [mainPlanRows, subplanRows, allClaimRows] = await Promise.all([
    loadMainPlanRowsForClaimDemand(supabaseAdmin, {
      masterPlanNo,
      dateFrom,
      dateTo,
    }),
    loadSubplanRowsForClaimDemand(supabaseAdmin, {
      masterPlanNo,
      dateFrom,
      dateTo,
    }),
    loadClaimRowsForDateRange(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom,
      dateTo,
    }),
  ]);
  const taggedSubplanRows = subplanRows.map((row) => ({
    ...row,
    demand_source: MATERIAL_DEMAND_SOURCES.SUBPLAN_RAW,
  }));
  const planRows = [...mainPlanRows, ...taggedSubplanRows];
  const analytics = buildDemandAnalytics(planRows);
  const demandRows = aggregateMaterialDemand(planRows, { grain });
  const demandKeys = new Set(
    demandRows.map((row) => (
      toClaimKey(
        row.materialSkuCode,
        row.bucketDate,
        row.materialGoodsCode,
        row.ownerDepartmentId,
        row.demandSource
      )
    ))
  );

  const extraClaimRows = (allClaimRows || []).filter((row) => {
    const status = String(row?.status || "").trim().toLowerCase();
    const overrideIssueQty = Number(row?.override_issue_qty);
    const isMeaningfulOverride = Number.isFinite(overrideIssueQty) && overrideIssueQty > 0;
    const key = toClaimKey(
      row?.material_sku_code,
      row?.[grain === "weekly" ? "week_start_date" : "work_date"],
      row?.material_goods_code,
      row?.owner_department_id,
      row?.demand_source
    );
    if (!key || demandKeys.has(key)) return false;
    return status === "claimed" || isMeaningfulOverride;
  });

  const allRowsForLookup = [
    ...demandRows,
    ...extraClaimRows.map((row) => ({
      materialSkuCode: row?.material_sku_code,
      materialGoodsCode: row?.material_goods_code || row?.material_sku_code,
      bucketDate: row?.[grain === "weekly" ? "week_start_date" : "work_date"],
      demandSource: row?.demand_source,
    })),
  ];

  const materialSkuCodes = allRowsForLookup.map((row) => normalizeSku(row.materialSkuCode));
  const materialGoodsCodes = allRowsForLookup.map((row) => normalizeSku(row.materialGoodsCode || row.materialSkuCode));
  const materialStockCodes = [...materialSkuCodes, ...materialGoodsCodes];
  const bucketDates = allRowsForLookup.map((row) => normalizeDateOnly(row.bucketDate));
  const [claimMap, tradeCodeMap, summaryUnitMap, stockMap] = await Promise.all([
    loadClaimMap(supabaseAdmin, {
      grain,
      masterPlanNo,
      materialSkuCodes,
      materialGoodsCodes,
      bucketDates,
      demandSources: demandRows.map((row) => row.demandSource),
    }),
    loadMaterialTradeCodeMap(materialGoodsCodes),
    loadMaterialUnitMapFromSummary(materialGoodsCodes),
    loadMaterialStockMap(materialStockCodes),
  ]);

  const claimDeptIds = Array.from(
    new Set(
      [...Array.from(claimMap.values()), ...extraClaimRows]
        .map((row) => String(row?.department_id || "").trim())
        .filter(Boolean)
    )
  );
  const ownerDeptIds = Array.from(
    new Set(extraClaimRows.map((row) => String(row?.owner_department_id || "").trim()).filter(Boolean))
  );
  const [departmentById, ownerDepartmentById] = await Promise.all([
    loadDepartmentMapByIds(supabaseAdmin, claimDeptIds),
    loadDepartmentMapByIds(supabaseAdmin, ownerDeptIds),
  ]);

  const rawRows = demandRows.map((row) => {
    const ownerDepartmentId = String(row.ownerDepartmentId || "").trim() || null;
    const claim = claimMap.get(
      toClaimKey(
        row.materialSkuCode,
        row.bucketDate,
        row.materialGoodsCode,
        ownerDepartmentId,
        row.demandSource
      )
    ) || null;
    const isClaimed = String(claim?.status || "").trim().toLowerCase() === "claimed";
    const departmentId = String(claim?.department_id || "").trim() || null;
    const department = departmentId ? departmentById.get(departmentId) || null : null;
    const rawOverrideIssueQty = claim?.override_issue_qty;
    const overrideIssueQty =
      rawOverrideIssueQty === null
      || rawOverrideIssueQty === undefined
      || rawOverrideIssueQty === ""
        ? null
        : Number(rawOverrideIssueQty);
    const effectiveIssueQty = Number.isFinite(overrideIssueQty) ? overrideIssueQty : row.issueQty;
    const normalizedGoodsCode = normalizeSku(row.materialGoodsCode || row.materialSkuCode);
    const normalizedSkuCode = normalizeSku(row.materialSkuCode);
    const tradeCodeInfo =
      tradeCodeMap.get(normalizedGoodsCode)
      || tradeCodeMap.get(normalizedSkuCode)
      || null;
    const mappedStockSkuCode = normalizeSku(tradeCodeInfo?.skuCode);
    const stockReferenceCode =
      normalizedGoodsCode && stockMap.has(normalizedGoodsCode)
        ? normalizedGoodsCode
        : mappedStockSkuCode && stockMap.has(mappedStockSkuCode)
          ? mappedStockSkuCode
          : (normalizedSkuCode && stockMap.has(normalizedSkuCode)
            ? normalizedSkuCode
            : (mappedStockSkuCode || normalizedGoodsCode || normalizedSkuCode));
    const stockInfo = stockReferenceCode ? stockMap.get(stockReferenceCode) || null : null;
    const referenceStockQty = Number(stockInfo?.qty) || 0;
    const referenceStockUnit =
      String(stockInfo?.unit || "").trim()
      || String(tradeCodeInfo?.unit || "").trim()
      || summaryUnitMap.get(normalizedGoodsCode)
      || summaryUnitMap.get(normalizedSkuCode)
      || row.unit;
    const stockReferenceNote =
      normalizedGoodsCode && stockReferenceCode && normalizedGoodsCode !== stockReferenceCode
        ? `Reference via SKU ${stockReferenceCode}`
        : null;
    return {
      masterPlanNo,
      grain,
      materialSkuCode: row.materialSkuCode,
      materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
      materialName: row.materialName,
      unit:
        String(tradeCodeInfo?.unit || "").trim()
        || summaryUnitMap.get(normalizedGoodsCode)
        || summaryUnitMap.get(normalizedSkuCode)
        || row.unit,
      referenceStockQty,
      referenceStockUnit,
      stockReferenceCode,
      stockReferenceNote,
      sourceRowKey: buildMaterialSourceRowKey({
        masterPlanNo,
        grain,
        bucketDate: row.bucketDate,
        materialSkuCode: row.materialSkuCode,
        materialGoodsCode: row.materialGoodsCode,
        ownerDepartmentId,
        demandSource: row.demandSource,
      }),
      demandSource: normalizeDemandSource(row.demandSource),
      demandSourceLabel: demandSourceLabel(row.demandSource),
      bucketDate: row.bucketDate,
      issueQty: effectiveIssueQty,
      demandIssueQty: row.issueQty,
      requiredQty: row.requiredQty,
      workDateFrom: row.workDateFrom,
      workDateTo: row.workDateTo,
      sourcePlanIds: row.sourcePlanIds,
      sourceSkuCodes: Array.isArray(row.sourceSkuCodes) ? row.sourceSkuCodes : [],
      sourceSkuNames: Array.isArray(row.sourceSkuNames) ? row.sourceSkuNames : [],
      sourcePlanSummaries: Array.isArray(row.sourcePlanSummaries) ? row.sourcePlanSummaries : [],
      ownerDepartmentId,
      ownerDepartmentCode: String(row.ownerDepartmentCode || "").trim().toUpperCase() || null,
      ownerDepartmentName: String(row.ownerDepartmentName || "").trim() || null,
      claimStatus: isClaimed ? "claimed" : "unassigned",
      claimDepartmentId: isClaimed ? departmentId : null,
      claimDepartmentCode: isClaimed ? (String(department?.code || "").trim() || null) : null,
      claimDepartmentName: isClaimed ? (String(department?.name || "").trim() || null) : null,
      claimSource: isClaimed ? (claim?.source || null) : null,
      claimNote: claim?.note || null,
      overrideIssueQty: Number.isFinite(overrideIssueQty) ? overrideIssueQty : null,
      claimedAt: claim?.claimed_at || null,
      claimedBy: claim?.claimed_by || null,
    };
  }).filter((row) => {
    return Number(row.issueQty || 0) > 0 || String(row.claimStatus || "").trim().toLowerCase() === "claimed";
  });

  const extraRows = extraClaimRows.map((row) => {
    const materialSkuCode = normalizeSku(row?.material_sku_code);
    const materialGoodsCode = normalizeSku(row?.material_goods_code || row?.material_sku_code);
    const ownerDepartmentId = String(row?.owner_department_id || "").trim() || null;
    const ownerDepartment = ownerDepartmentId ? ownerDepartmentById.get(ownerDepartmentId) || null : null;
    const departmentId = String(row?.department_id || "").trim() || null;
    const department = departmentId ? departmentById.get(departmentId) || null : null;
    const tradeCodeInfo =
      tradeCodeMap.get(materialGoodsCode)
      || tradeCodeMap.get(materialSkuCode)
      || null;
    const stockInfo =
      stockMap.get(materialGoodsCode)
      || stockMap.get(materialSkuCode)
      || null;
    const issueQty = Number(row?.override_issue_qty ?? 0);
    const isClaimed = String(row?.status || "").trim().toLowerCase() === "claimed";
    return {
      masterPlanNo,
      grain,
      materialSkuCode,
      materialGoodsCode: materialGoodsCode || materialSkuCode,
      materialName: String(tradeCodeInfo?.name || materialGoodsCode || materialSkuCode).trim() || materialSkuCode,
      unit:
        String(tradeCodeInfo?.unit || "").trim()
        || summaryUnitMap.get(materialGoodsCode)
        || summaryUnitMap.get(materialSkuCode)
        || "",
      referenceStockQty: Number(stockInfo?.qty) || 0,
      referenceStockUnit:
        String(stockInfo?.unit || "").trim()
        || String(tradeCodeInfo?.unit || "").trim()
        || summaryUnitMap.get(materialGoodsCode)
        || summaryUnitMap.get(materialSkuCode)
        || "",
      stockReferenceCode: materialGoodsCode || materialSkuCode,
      stockReferenceNote: "Added by material verify replacement",
      sourceRowKey: buildMaterialSourceRowKey({
        masterPlanNo,
        grain,
        bucketDate: row?.[grain === "weekly" ? "week_start_date" : "work_date"],
        materialSkuCode,
        materialGoodsCode,
        ownerDepartmentId,
        demandSource: row?.demand_source,
      }),
      demandSource: normalizeDemandSource(row?.demand_source),
      demandSourceLabel: demandSourceLabel(row?.demand_source),
      bucketDate: normalizeDateOnly(row?.[grain === "weekly" ? "week_start_date" : "work_date"]),
      issueQty,
      demandIssueQty: 0,
      requiredQty: issueQty,
      workDateFrom: normalizeDateOnly(row?.[grain === "weekly" ? "week_start_date" : "work_date"]),
      workDateTo: normalizeDateOnly(row?.[grain === "weekly" ? "week_start_date" : "work_date"]),
      sourcePlanIds: [],
      sourceSkuCodes: [],
      sourceSkuNames: [],
      sourcePlanSummaries: [],
      ownerDepartmentId,
      ownerDepartmentCode: String(ownerDepartment?.code || "").trim().toUpperCase() || null,
      ownerDepartmentName: String(ownerDepartment?.name || "").trim() || null,
      claimStatus: isClaimed ? "claimed" : "unassigned",
      claimDepartmentId: isClaimed ? departmentId : null,
      claimDepartmentCode: isClaimed ? (String(department?.code || "").trim() || null) : null,
      claimDepartmentName: isClaimed ? (String(department?.name || "").trim() || null) : null,
      claimSource: row?.source || null,
      claimNote: row?.note || null,
      overrideIssueQty: Number.isFinite(issueQty) ? issueQty : null,
      claimedAt: row?.claimed_at || null,
      claimedBy: row?.claimed_by || null,
      isVerifyReplacement: true,
    };
  }).filter((row) => Number(row.issueQty || 0) > 0 || String(row.claimStatus || "").trim().toLowerCase() === "claimed");

  const allRawRows = [...rawRows, ...extraRows];
  const rows = mergeCompositePoolRows(allRawRows);

  return {
    planRows,
    rows,
    rawRows: allRawRows,
    analytics,
    summary: {
      totalRows: rows.length,
      claimedRows: rows.filter((row) => row.claimStatus === "claimed").length,
      unassignedRows: rows.filter((row) => row.claimStatus !== "claimed").length,
    },
  };
}

function mergeCompositePoolRows(rows = []) {
  const byKey = new Map();

  rows.forEach((row) => {
    const materialCode = String(row.materialGoodsCode || row.materialSkuCode || "").trim().toUpperCase();
    const ownerDeptId = String(row.ownerDepartmentId || "").trim() || "UNASSIGNED";
    const key = `${materialCode}|${row.bucketDate}|${ownerDeptId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  });

  const result = [];
  byKey.forEach((group) => {
    if (group.length === 1) {
      result.push(group[0]);
      return;
    }

    // If claimed by different departments, show separately to avoid confusion
    const claimedRows = group.filter((r) => r.claimStatus === "claimed");
    const claimDeptIds = new Set(claimedRows.map((r) => r.claimDepartmentId).filter(Boolean));
    if (claimDeptIds.size > 1) {
      group.forEach((r) => result.push(r));
      return;
    }

    const primary = group[0];
    const claimedRow = claimedRows[0] || null;
    const allClaimed = group.every((r) => r.claimStatus === "claimed");
    const noneClaimed = group.every((r) => r.claimStatus !== "claimed");

    result.push({
      ...primary,
      issueQty: toRounded(group.reduce((s, r) => s + (r.issueQty || 0), 0)),
      demandIssueQty: toRounded(group.reduce((s, r) => s + (r.issueQty || 0), 0)),
      requiredQty: toRounded(group.reduce((s, r) => s + (r.requiredQty || 0), 0)),
      sourcePlanIds: [...new Set(group.flatMap((r) => r.sourcePlanIds || []))],
      sourceSkuCodes: [...new Set(group.flatMap((r) => r.sourceSkuCodes || []))],
      sourceSkuNames: [...new Set(group.flatMap((r) => r.sourceSkuNames || []))],
      sourcePlanSummaries: Array.from(
        group.reduce((map, row) => {
          (row.sourcePlanSummaries || []).forEach((summary) => {
            const planId = String(summary?.planId || "").trim();
            if (!planId || map.has(planId)) return;
            map.set(planId, {
              planId,
              skuCode: String(summary?.skuCode || "").trim() || null,
              skuName: String(summary?.skuName || "").trim() || null,
              plannedQty: Number(summary?.plannedQty) || 0,
              unit: String(summary?.unit || "").trim() || "unit",
            });
          });
          return map;
        }, new Map()).values()
      ),
      demandSource: "composite",
      demandSourceLabel: "รวมทุกแหล่ง",
      sourceRowKey: primary.sourceRowKey,
      componentSourceRowKeys: group.map((r) => r.sourceRowKey),
      isComposite: true,
      claimStatus: allClaimed ? "claimed" : noneClaimed ? "unassigned" : "partial",
      claimDepartmentId: claimedRow?.claimDepartmentId || primary.claimDepartmentId || null,
      claimDepartmentCode: claimedRow?.claimDepartmentCode || primary.claimDepartmentCode || null,
      claimDepartmentName: claimedRow?.claimDepartmentName || primary.claimDepartmentName || null,
      claimedAt: claimedRow?.claimedAt || null,
      claimedBy: claimedRow?.claimedBy || null,
    });
  });

  return result;
}
