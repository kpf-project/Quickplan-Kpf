import "server-only";

const DAILY_GRAIN = "daily";
const WEEKLY_GRAIN = "weekly";
const DEFAULT_DEMAND_SOURCE = "subplan_raw";

export const MATERIAL_DEMAND_SOURCES = Object.freeze({
  FG_DIRECT: "fg_direct",
  SUBPLAN_RAW: "subplan_raw",
});

export function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeGoodsCode(value, fallback = "") {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized) return normalized;
  return normalizeSku(fallback);
}

export function normalizeDepartmentId(value) {
  return String(value || "").trim();
}

export function resolveMaterialClaimCode(materialSkuCode, materialGoodsCode) {
  return normalizeGoodsCode(materialGoodsCode, materialSkuCode);
}

export function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function normalizeClaimGrain(value, fallback = DAILY_GRAIN) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WEEKLY_GRAIN) return WEEKLY_GRAIN;
  if (normalized === DAILY_GRAIN) return DAILY_GRAIN;
  return fallback;
}

export function normalizeDemandSource(value, fallback = DEFAULT_DEMAND_SOURCE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === MATERIAL_DEMAND_SOURCES.FG_DIRECT) return MATERIAL_DEMAND_SOURCES.FG_DIRECT;
  if (normalized === MATERIAL_DEMAND_SOURCES.SUBPLAN_RAW) return MATERIAL_DEMAND_SOURCES.SUBPLAN_RAW;
  return fallback;
}

export function demandSourceLabel(value) {
  const normalized = normalizeDemandSource(value);
  if (normalized === MATERIAL_DEMAND_SOURCES.FG_DIRECT) return "FG Direct";
  return "WIP/Subplan";
}

export function weekStartFromDate(dateValue) {
  const normalized = normalizeDateOnly(dateValue);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + distanceToMonday);
  return date.toISOString().slice(0, 10);
}

export function bucketDateForWorkDate(workDate, grain = DAILY_GRAIN) {
  const date = normalizeDateOnly(workDate);
  if (!date) return null;
  if (normalizeClaimGrain(grain) === WEEKLY_GRAIN) {
    return weekStartFromDate(date);
  }
  return date;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseSnapshotIssueMaterials(bomSnapshot, context = {}) {
  const root = Array.isArray(bomSnapshot) ? bomSnapshot[0] : null;
  const materials = Array.isArray(root?.materials) ? root.materials : [];
  const workDate = normalizeDateOnly(context?.workDate);
  const sourcePlanId = String(context?.sourcePlanId || "").trim() || null;
  const sourceSkuCode = normalizeSku(root?.skuCode || context?.sourceSkuCode);
  const sourceSkuName = String(root?.skuName || context?.sourceSkuName || "").trim() || sourceSkuCode;
  const sourcePlannedQty = toNumber(root?.plannedQty ?? context?.sourcePlannedQty, 0);
  const sourcePlannedUnit = String(root?.unit || context?.sourcePlannedUnit || "").trim() || "unit";
  const sourceOwnerDepartmentId =
    normalizeDepartmentId(context?.sourceOwnerDepartmentId) || null;
  const sourceOwnerDepartmentCode =
    String(context?.sourceOwnerDepartmentCode || "").trim().toUpperCase() || null;
  const sourceOwnerDepartmentName =
    String(context?.sourceOwnerDepartmentName || "").trim() || null;

  return materials
    .map((mat) => {
      const requiredQty = toNumber(mat?.requiredQty ?? 0, 0);
      const issueQtyRaw = mat?.issueQty ?? mat?.issuedQty;
      const issueQty = toNumber(issueQtyRaw, Math.ceil(requiredQty));
      return {
        materialSkuCode: normalizeSku(mat?.skuCode || mat?.material_sku_code),
        materialGoodsCode: resolveMaterialClaimCode(
          mat?.skuCode || mat?.material_sku_code,
          mat?.goodsCode || mat?.material_goods_code
        ),
        materialName: String(mat?.name || mat?.skuName || "").trim(),
        unit: String(mat?.unit || mat?.uom || "").trim() || "unit",
        requiredQty,
        issueQty,
        itemType: String(mat?.itemType || mat?.item_type || "")
          .trim()
          .toUpperCase(),
        workDate,
        sourcePlanId,
        sourceSkuCode,
        sourceSkuName,
        sourcePlannedQty,
        sourcePlannedUnit,
        sourceOwnerDepartmentId,
        sourceOwnerDepartmentCode,
        sourceOwnerDepartmentName,
      };
    })
    .filter((row) => {
      if (!row.materialSkuCode) return false;
      if (row.issueQty <= 0 && row.requiredQty <= 0) return false;
      // Keep backward compatibility with old snapshots that may not provide itemType.
      if (row.itemType === "WIP") return false;
      return true;
    });
}

export function aggregateMaterialDemandByDepartment(planRows = [], options = {}) {
  const grain = normalizeClaimGrain(options?.grain, DAILY_GRAIN);
  const byKey = new Map();

  (Array.isArray(planRows) ? planRows : []).forEach((row) => {
    const workDate = normalizeDateOnly(row?.period_start);
    if (!workDate) return;
    const sourcePlanId = String(row?.plan_id || "").trim() || null;
    const sourceOwnerDepartmentId =
      String(row?.owner_department_id || "").trim() || null;
    const sourceOwnerDepartmentCode =
      String(row?.production_departments?.code || "").trim().toUpperCase() || null;
    const sourceOwnerDepartmentName =
      String(row?.production_departments?.name || "").trim() || null;
    const demandSource = normalizeDemandSource(row?.demand_source);

    const parsed = parseSnapshotIssueMaterials(row?.bom_snapshot, {
      workDate,
      sourcePlanId,
      sourceOwnerDepartmentId,
      sourceOwnerDepartmentCode,
      sourceOwnerDepartmentName,
    });

    parsed.forEach((item) => {
      const bucketDate = bucketDateForWorkDate(item.workDate, grain);
      if (!bucketDate) return;
      const departmentId = item.sourceOwnerDepartmentId || "UNASSIGNED";
      const materialClaimCode = resolveMaterialClaimCode(item.materialSkuCode, item.materialGoodsCode);
      const claimKey = `${bucketDate}|${departmentId}|${materialClaimCode}|${demandSource}`;
      if (!byKey.has(claimKey)) {
        byKey.set(claimKey, {
          key: claimKey,
          grain,
          demandSource,
          bucketDate,
          departmentId,
          departmentCode: item.sourceOwnerDepartmentCode || null,
          departmentName: item.sourceOwnerDepartmentName || null,
          materialSkuCode: item.materialSkuCode,
          materialGoodsCode: materialClaimCode,
          materialName: item.materialName || item.materialSkuCode,
          unit: item.unit || "unit",
          issueQty: 0,
          requiredQty: 0,
          workDateFrom: item.workDate,
          workDateTo: item.workDate,
          sourcePlanIds: new Set(),
          sourceSkuCodes: new Set(),
          sourceSkuNames: new Set(),
          sourcePlanSummaries: new Map(),
        });
      }
      const target = byKey.get(claimKey);
      target.issueQty += toNumber(item.issueQty, 0);
      target.requiredQty += toNumber(item.requiredQty, 0);
      if (item.sourceSkuCode) target.sourceSkuCodes.add(item.sourceSkuCode);
      if (item.sourceSkuName) target.sourceSkuNames.add(item.sourceSkuName);
      if (item.workDate && (!target.workDateFrom || item.workDate < target.workDateFrom)) {
        target.workDateFrom = item.workDate;
      }
      if (item.workDate && (!target.workDateTo || item.workDate > target.workDateTo)) {
        target.workDateTo = item.workDate;
      }
      if (item.sourcePlanId) {
        target.sourcePlanIds.add(item.sourcePlanId);
        if (!target.sourcePlanSummaries.has(item.sourcePlanId)) {
          target.sourcePlanSummaries.set(item.sourcePlanId, {
            planId: item.sourcePlanId,
            skuCode: item.sourceSkuCode || null,
            skuName: item.sourceSkuName || item.sourceSkuCode || null,
            plannedQty: toNumber(item.sourcePlannedQty, 0),
            unit: item.sourcePlannedUnit || "unit",
          });
        }
      }
    });
  });

  return Array.from(byKey.values())
    .map((row) => ({
      ...row,
      issueQty: Number((Math.round(row.issueQty * 1000) / 1000).toFixed(3)),
      requiredQty: Number((Math.round(row.requiredQty * 1000) / 1000).toFixed(3)),
      sourcePlanIds: Array.from(row.sourcePlanIds || []),
      sourceSkuCodes: Array.from(row.sourceSkuCodes || []),
      sourceSkuNames: Array.from(row.sourceSkuNames || []),
      sourcePlanSummaries: Array.from(row.sourcePlanSummaries?.values?.() || []),
    }))
    .sort((a, b) => {
      const dateCompare = String(a.bucketDate || "").localeCompare(
        String(b.bucketDate || "")
      );
      if (dateCompare !== 0) return dateCompare;
      const deptCompare = String(a.departmentCode || a.departmentId || "").localeCompare(
        String(b.departmentCode || b.departmentId || "")
      );
      if (deptCompare !== 0) return deptCompare;
      return String(a.materialSkuCode || "").localeCompare(
        String(b.materialSkuCode || "")
      );
    });
}

export function aggregateMaterialDemand(planRows = [], options = {}) {
  const grain = normalizeClaimGrain(options?.grain, DAILY_GRAIN);
  const byKey = new Map();

  (Array.isArray(planRows) ? planRows : []).forEach((row) => {
    const workDate = normalizeDateOnly(row?.period_start);
    if (!workDate) return;
    const sourcePlanId = String(row?.plan_id || "").trim() || null;
    const sourceOwnerDepartmentId =
      normalizeDepartmentId(row?.owner_department_id) || null;
    const sourceOwnerDepartmentCode =
      String(row?.production_departments?.code || "").trim().toUpperCase() || null;
    const sourceOwnerDepartmentName =
      String(row?.production_departments?.name || "").trim() || null;
    const demandSource = normalizeDemandSource(row?.demand_source);
    const parsed = parseSnapshotIssueMaterials(row?.bom_snapshot, {
      workDate,
      sourcePlanId,
      sourceOwnerDepartmentId,
      sourceOwnerDepartmentCode,
      sourceOwnerDepartmentName,
    });
    parsed.forEach((item) => {
      const bucketDate = bucketDateForWorkDate(item.workDate, grain);
      if (!bucketDate) return;
      const materialClaimCode = resolveMaterialClaimCode(item.materialSkuCode, item.materialGoodsCode);
      const ownerDepartmentId = item.sourceOwnerDepartmentId || "UNASSIGNED";
      const key = `${materialClaimCode}|${bucketDate}|${ownerDepartmentId}|${demandSource}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          grain,
          demandSource,
          materialSkuCode: item.materialSkuCode,
          materialGoodsCode: materialClaimCode,
          materialName: item.materialName || item.materialSkuCode,
          unit: item.unit || "unit",
          bucketDate,
          ownerDepartmentId: item.sourceOwnerDepartmentId || null,
          ownerDepartmentCode: item.sourceOwnerDepartmentCode || null,
          ownerDepartmentName: item.sourceOwnerDepartmentName || null,
          issueQty: 0,
          requiredQty: 0,
          workDateFrom: item.workDate,
          workDateTo: item.workDate,
          sourcePlanIds: new Set(),
          sourceSkuCodes: new Set(),
          sourceSkuNames: new Set(),
          sourcePlanSummaries: new Map(),
        });
      }
      const target = byKey.get(key);
      target.issueQty += toNumber(item.issueQty, 0);
      target.requiredQty += toNumber(item.requiredQty, 0);
      if (item.sourceSkuCode) target.sourceSkuCodes.add(item.sourceSkuCode);
      if (item.sourceSkuName) target.sourceSkuNames.add(item.sourceSkuName);
      if (item.workDate && (!target.workDateFrom || item.workDate < target.workDateFrom)) {
        target.workDateFrom = item.workDate;
      }
      if (item.workDate && (!target.workDateTo || item.workDate > target.workDateTo)) {
        target.workDateTo = item.workDate;
      }
      if (item.sourcePlanId) {
        target.sourcePlanIds.add(item.sourcePlanId);
        if (!target.sourcePlanSummaries.has(item.sourcePlanId)) {
          target.sourcePlanSummaries.set(item.sourcePlanId, {
            planId: item.sourcePlanId,
            skuCode: item.sourceSkuCode || null,
            skuName: item.sourceSkuName || item.sourceSkuCode || null,
            plannedQty: toNumber(item.sourcePlannedQty, 0),
            unit: item.sourcePlannedUnit || "unit",
          });
        }
      }
    });
  });

  return Array.from(byKey.values())
    .map((row) => ({
      ...row,
      issueQty: Number((Math.round(row.issueQty * 1000) / 1000).toFixed(3)),
      requiredQty: Number((Math.round(row.requiredQty * 1000) / 1000).toFixed(3)),
      sourcePlanIds: Array.from(row.sourcePlanIds || []),
      sourceSkuCodes: Array.from(row.sourceSkuCodes || []),
      sourceSkuNames: Array.from(row.sourceSkuNames || []),
      sourcePlanSummaries: Array.from(row.sourcePlanSummaries?.values?.() || []),
    }))
    .sort((a, b) => {
      const dateCompare = String(a.bucketDate || "").localeCompare(
        String(b.bucketDate || "")
      );
      if (dateCompare !== 0) return dateCompare;
      return String(a.materialSkuCode || "").localeCompare(
        String(b.materialSkuCode || "")
      );
    });
}

export function claimTableName(grain = DAILY_GRAIN) {
  return normalizeClaimGrain(grain) === WEEKLY_GRAIN
    ? "production_material_claims_weekly"
    : "production_material_claims_daily";
}

export function claimDateColumn(grain = DAILY_GRAIN) {
  return normalizeClaimGrain(grain) === WEEKLY_GRAIN
    ? "week_start_date"
    : "work_date";
}

export function toClaimKey(
  materialSkuCode,
  bucketDate,
  materialGoodsCode = "",
  ownerDepartmentId = "",
  demandSource = DEFAULT_DEMAND_SOURCE
) {
  return [
    resolveMaterialClaimCode(materialSkuCode, materialGoodsCode),
    normalizeDateOnly(bucketDate) || "",
    normalizeDepartmentId(ownerDepartmentId) || "UNASSIGNED",
    normalizeDemandSource(demandSource),
  ].join("|");
}

export function buildMaterialSourceRowKey({
  masterPlanNo,
  grain,
  bucketDate,
  materialSkuCode,
  materialGoodsCode,
  ownerDepartmentId,
  demandSource,
}) {
  return [
    String(masterPlanNo || "").trim().toUpperCase(),
    normalizeClaimGrain(grain),
    normalizeDateOnly(bucketDate) || "",
    resolveMaterialClaimCode(materialSkuCode, materialGoodsCode),
    normalizeDepartmentId(ownerDepartmentId) || "UNASSIGNED",
    normalizeDemandSource(demandSource),
  ].join("::");
}

export async function loadClaimMap(supabaseAdmin, options = {}) {
  const grain = normalizeClaimGrain(options?.grain, DAILY_GRAIN);
  const table = claimTableName(grain);
  const dateColumn = claimDateColumn(grain);
  const masterPlanNo = String(options?.masterPlanNo || "").trim().toUpperCase();
  const materialSkuCodes = Array.from(
    new Set((options?.materialSkuCodes || []).map(normalizeSku).filter(Boolean))
  );
  const materialGoodsCodes = Array.from(
    new Set(
      (options?.materialGoodsCodes || [])
        .map((value) => normalizeGoodsCode(value))
        .filter(Boolean)
    )
  );
  const bucketDates = Array.from(
    new Set((options?.bucketDates || []).map(normalizeDateOnly).filter(Boolean))
  );
  const demandSources = Array.from(
    new Set((options?.demandSources || []).map((value) => normalizeDemandSource(value)).filter(Boolean))
  );
  if (!masterPlanNo || !materialSkuCodes.length || !bucketDates.length) {
    return new Map();
  }

  let query = supabaseAdmin
    .from(table)
    .select(
      `id,master_plan_no,material_sku_code,material_goods_code,owner_department_id,demand_source,${dateColumn},department_id,status,source,note,claimed_by,claimed_at,override_issue_qty`
    )
    .eq("master_plan_no", masterPlanNo)
    .in("material_sku_code", materialSkuCodes)
    .in(dateColumn, bucketDates);

  const supportsGoodsCode = materialGoodsCodes.length > 0;
  if (supportsGoodsCode) {
    query = query.select(
      `id,master_plan_no,material_sku_code,material_goods_code,owner_department_id,demand_source,${dateColumn},department_id,status,source,note,claimed_by,claimed_at,override_issue_qty`
    );
    query = query.in("material_goods_code", materialGoodsCodes);
  }
  if (demandSources.length) {
    query = query.in("demand_source", demandSources);
  }

  const { data, error } = await query;
  if (error) {
    return new Map();
  }
  const map = new Map();
  (data || []).forEach((row) => {
    const key = toClaimKey(
      row?.material_sku_code,
      row?.[dateColumn],
      row?.material_goods_code,
      row?.owner_department_id,
      row?.demand_source
    );
    if (!key || map.has(key)) return;
    map.set(key, row);
  });
  return map;
}
