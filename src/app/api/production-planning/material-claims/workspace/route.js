import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { loadClaimScope } from "@/lib/claimPermissions";
import {
  canEditAssignedDepartment,
  loadMaterialOwnerMap,
  loadVerifyEditorScope,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";
import { annotateRowsWithMaterialVerification } from "@/lib/materialVerifyConfirmations";
import { normalizeClaimGrain, normalizeSku } from "@/lib/materialClaims";

export const dynamic = "force-dynamic";

const MATERIAL_TAB_ID = "all";
const SUBPLAN_RAW = "subplan_raw";

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function formatQty(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty === 0) return "-";
  return qty % 1 === 0
    ? qty.toLocaleString("th-TH")
    : qty.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function buildWipByDate(rows) {
  const dateMap = new Map();

  rows.forEach((row) => {
    if (String(row?.demandSource || "").trim() !== SUBPLAN_RAW) return;
    const bucketDate = String(row?.bucketDate || "").trim();
    if (!bucketDate) return;

    if (!dateMap.has(bucketDate)) {
      dateMap.set(bucketDate, {
        planMap: new Map(),
      });
    }

    const bucket = dateMap.get(bucketDate);
    const summaries = Array.isArray(row?.sourcePlanSummaries) ? row.sourcePlanSummaries : [];

    summaries.forEach((summary) => {
      const planId = String(summary?.planId || "").trim();
      const skuCode = normalizeSku(summary?.skuCode || summary?.sku_code || summary?.sourceSkuCode);
      const skuName = String(
        summary?.skuName
        || summary?.sku_name
        || summary?.sourceSkuName
        || skuCode
        || "-"
      ).trim();
      const plannedQty = Number(summary?.plannedQty ?? summary?.planned_qty ?? summary?.qty ?? 0);
      const summaryKey = planId || `${skuCode || skuName}::${plannedQty}`;
      if (!summaryKey) return;

      if (!bucket.planMap.has(summaryKey)) {
        bucket.planMap.set(summaryKey, {
          name: skuName,
          plannedQty: Number.isFinite(plannedQty) ? plannedQty : 0,
        });
      }
    });
  });

  return Object.fromEntries(
    Array.from(dateMap.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucketDate, bucket]) => {
        const lineMap = new Map();
        Array.from(bucket.planMap.values()).forEach((plan) => {
          const lineKey = String(plan?.name || "").trim() || "-";
          if (!lineMap.has(lineKey)) {
            lineMap.set(lineKey, {
              name: lineKey,
              plannedQty: 0,
            });
          }
          lineMap.get(lineKey).plannedQty += Number(plan?.plannedQty || 0);
        });

        return [
          bucketDate,
          Array.from(lineMap.values())
            .sort((left, right) => left.name.localeCompare(right.name, "th"))
            .map((line) => ({
              ...line,
              displayQty: formatQty(line.plannedQty),
            })),
        ];
      })
  );
}

function buildMaterialMatrix(rows, scope, claimScope, releaseScope) {
  const materialMap = new Map();
  const dateSet = new Set();
  const claimDeptIds = new Set(claimScope?.departmentIds || []);
  const releaseDeptIds = new Set(releaseScope?.departmentIds || []);

  rows.forEach((row) => {
    const materialSkuCode = normalizeSku(row?.materialSkuCode);
    const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
    const materialKey = materialGoodsCode || materialSkuCode;
    if (!materialKey) return;

    const bucketDate = String(row?.bucketDate || "").trim();
    if (!bucketDate) return;
    dateSet.add(bucketDate);

    if (!materialMap.has(materialKey)) {
      materialMap.set(materialKey, {
        matSkuCode: materialSkuCode || materialGoodsCode,
        matGoodsCode: materialGoodsCode || materialSkuCode,
        materialKey,
        matName: String(row?.materialName || materialKey).trim(),
        unit: String(row?.unit || "").trim(),
        byDate: {},
      });
    }

    const material = materialMap.get(materialKey);
    if (!material.byDate[bucketDate]) {
      material.byDate[bucketDate] = {
        totalQty: 0,
        totalRows: 0,
        claimedRows: 0,
        entries: [],
      };
    }

    const cell = material.byDate[bucketDate];
    const qty = Number(row?.issueQty ?? row?.requiredQty ?? 0);
    const claimDepartmentId = String(row?.claimDepartmentId || "").trim();
    const assignedDepartmentId = String(row?.assignedDepartmentId || "").trim();
    const isClaimed = String(row?.claimStatus || "").trim().toLowerCase() === "claimed";
    const materialVerified = Boolean(row?.materialVerified);
    const canClaim = !isClaimed && materialVerified && (
      claimScope?.canManageGlobal
      || (assignedDepartmentId && claimDeptIds.has(assignedDepartmentId))
    );
    const canRelease = isClaimed && (
      releaseScope?.canManageGlobal
      || (claimDepartmentId && releaseDeptIds.has(claimDepartmentId))
    );

    cell.totalQty += qty;
    cell.totalRows += 1;
    if (isClaimed) cell.claimedRows += 1;
    cell.entries.push({
      sourceRowKey: String(row?.sourceRowKey || "").trim(),
      materialSkuCode: material.matSkuCode,
      materialGoodsCode: material.matGoodsCode,
      materialName: material.matName,
      unit: material.unit || "-",
      issueQty: qty,
      bucketDate,
      demandSource: String(row?.demandSource || "").trim(),
      demandSourceLabel: String(row?.demandSourceLabel || "").trim() || "-",
      ownerDepartmentId: String(row?.ownerDepartmentId || "").trim() || null,
      ownerDepartmentCode: String(row?.ownerDepartmentCode || "").trim() || null,
      ownerDepartmentName: String(row?.ownerDepartmentName || "").trim() || null,
      assignedDepartmentId,
      assignedDepartmentName: String(row?.assignedDepartmentName || "").trim() || null,
      materialVerified,
      materialVerificationStatus: materialVerified ? "verified" : "pending",
      claimStatus: isClaimed ? "claimed" : "unassigned",
      claimDepartmentId: claimDepartmentId || null,
      claimDepartmentCode: String(row?.claimDepartmentCode || "").trim() || null,
      claimDepartmentName: String(row?.claimDepartmentName || "").trim() || null,
      canClaim,
      canRelease,
      canEdit: canEditAssignedDepartment(scope, assignedDepartmentId),
    });
  });

  const dates = Array.from(dateSet).sort();
  const materials = Array.from(materialMap.values())
    .sort((left, right) => left.matName.localeCompare(right.matName, "th"))
    .map((material) => ({
      ...material,
      weeklyTotal: dates.reduce((sum, date) => sum + Number(material.byDate?.[date]?.totalQty || 0), 0),
    }));

  return { dates, materials };
}

function buildSectionRows(rows, departmentId) {
  const normalizedDepartmentId = String(departmentId || "").trim();
  return rows.filter((row) => String(row?.assignedDepartmentId || "").trim() === normalizedDepartmentId);
}

function buildQaSectionRows(rows, departmentId, qaDeptIds) {
  const normalizedDepartmentId = String(departmentId || "").trim();
  return rows.filter((row) => {
    if (String(row?.ownerDepartmentId || "").trim() !== normalizedDepartmentId) return false;

    // If it's assigned to a non-QA department (Central), it should NOT be in the QA tab
    const assignedDepartmentId = String(row?.assignedDepartmentId || "").trim();
    if (assignedDepartmentId && !qaDeptIds.has(assignedDepartmentId)) return false;

    return true;
  });
}

function buildCentralSectionRows(rows, departmentId) {
  const normalizedDepartmentId = String(departmentId || "").trim();
  return rows.filter((row) => {
    const assignedDepartmentId = String(row?.assignedDepartmentId || "").trim();
    if (assignedDepartmentId !== normalizedDepartmentId) return false;
    return true;
  });
}

function isQaDepartment(departmentCode, departmentName) {
  const normalizedCode = String(departmentCode || "").trim().toUpperCase();
  const normalizedName = String(departmentName || "").trim().toUpperCase();
  return normalizedCode.includes("QA") || normalizedName.includes("QA");
}

function buildSectionView(rows, scope, claimScope, releaseScope, section, wipRows = null) {
  const sectionRows = buildSectionRows(rows, section.deptId);
  const materialView = buildMaterialMatrix(sectionRows, scope, claimScope, releaseScope);
  return {
    id: section.id,
    deptId: section.deptId,
    label: section.label,
    departmentCode: section.departmentCode || null,
    departmentName: section.departmentName || section.label,
    wipByDate: buildWipByDate(Array.isArray(wipRows) ? wipRows : sectionRows),
    materials: materialView.materials,
    dates: materialView.dates,
    summary: {
      materialCount: materialView.materials.length,
      totalQty: materialView.materials.reduce((sum, material) => sum + Number(material.weeklyTotal || 0), 0),
    },
  };
}

function buildQaTabs(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const deptId = String(row?.ownerDepartmentId || "").trim();
    if (!deptId || map.has(deptId)) return;

    const deptCode = String(row?.ownerDepartmentCode || "").trim().toUpperCase() || null;
    const deptName = String(row?.ownerDepartmentName || "").trim() || null;
    map.set(deptId, {
      id: `qa:${deptId}`,
      deptId,
      label: deptName || deptCode || deptId,
      departmentCode: deptCode,
      departmentName: deptName,
    });
  });

  return Array.from(map.values()).sort((left, right) => (
    String(left.label || "").localeCompare(String(right.label || ""), "th")
  ));
}

function buildCentralSections(rows, qaDeptIds) {
  const map = new Map();

  rows.forEach((row) => {
    const deptId = String(row?.assignedDepartmentId || "").trim();
    if (!deptId || qaDeptIds.has(deptId) || map.has(deptId)) return;

    const deptCode = String(row?.assignedDepartmentCode || "").trim().toUpperCase() || null;
    const deptName = String(row?.assignedDepartmentName || "").trim() || null;
    if (isQaDepartment(deptCode, deptName)) return;
    map.set(deptId, {
      id: `responsible:${deptId}`,
      deptId,
      label: deptName || deptCode || deptId,
      departmentCode: deptCode,
      departmentName: deptName,
    });
  });

  return Array.from(map.values()).sort((left, right) => (
    String(left.label || "").localeCompare(String(right.label || ""), "th")
  ));
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
      "plan.view_claim_all",
      "plan.claim_material",
      "plan.release_claim",
      "plan.verify_materials",
    ]);

    const { searchParams } = new URL(request.url);
    const inputMasterPlanNo = normalizeParam(
      searchParams.get("masterPlanNo") || searchParams.get("planNo")
    );
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const grain = normalizeClaimGrain(searchParams.get("grain") || "daily", "daily");
    const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
    const dateTo = normalizeDateOnly(searchParams.get("dateTo"));

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [scope, claimScope, releaseScope, ownerByMaterialKey, poolResult] = await Promise.all([
      loadVerifyEditorScope(supabaseAdmin, permission.userId, permission.isAdmin),
      loadClaimScope({ supabaseAdmin, request, permission, action: "claim" }),
      loadClaimScope({ supabaseAdmin, request, permission, action: "release" }),
      loadMaterialOwnerMap(supabaseAdmin),
      buildClaimPoolRows(supabaseAdmin, { masterPlanNo, grain, dateFrom, dateTo }),
    ]);

    const baseRows = Array.isArray(poolResult?.rawRows) && poolResult.rawRows.length > 0
      ? poolResult.rawRows
      : (Array.isArray(poolResult?.rows) ? poolResult.rows : []);

    const assignedRows = baseRows.map((row) => {
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      return {
        ...row,
        assignedDepartmentId: assignedDepartment.departmentId,
        assignedDepartmentCode: assignedDepartment.departmentCode,
        assignedDepartmentName: assignedDepartment.departmentName,
      };
    });

    const verifiedAssignedRows = await annotateRowsWithMaterialVerification(supabaseAdmin, assignedRows, {
      masterPlanNo,
      grain,
    });

    const qaTabs = buildQaTabs(verifiedAssignedRows);
    const qaDeptIds = new Set(qaTabs.map((tab) => String(tab.deptId || "").trim()));
    const centralSections = buildCentralSections(verifiedAssignedRows, qaDeptIds);

    const allMaterialView = buildMaterialMatrix(verifiedAssignedRows, scope, claimScope, releaseScope);
    const centralViews = centralSections.map((section) => (
      buildSectionView(
        buildCentralSectionRows(verifiedAssignedRows, section.deptId),
        scope,
        claimScope,
        releaseScope,
        section,
        verifiedAssignedRows
      )
    )).filter((section) => Array.isArray(section?.materials) && section.materials.length > 0);
    const qaViews = Object.fromEntries(
      qaTabs.map((tab) => {
        const qaRows = buildQaSectionRows(verifiedAssignedRows, tab.deptId, qaDeptIds);
        const materialView = buildMaterialMatrix(qaRows, scope, claimScope, releaseScope);
        return [tab.id, {
          id: tab.id,
          deptId: tab.deptId,
          label: tab.label,
          departmentCode: tab.departmentCode || null,
          departmentName: tab.departmentName || tab.label,
          wipByDate: buildWipByDate(qaRows),
          materials: materialView.materials,
          dates: materialView.dates,
          summary: {
            materialCount: materialView.materials.length,
            totalQty: materialView.materials.reduce((sum, material) => sum + Number(material.weeklyTotal || 0), 0),
          },
        }];
      })
    );

    return NextResponse.json({
      dates: allMaterialView.dates,
      materialView: {
        tab: { id: MATERIAL_TAB_ID, label: "รวมวัตถุดิบทั้งหมด" },
        wipByDate: buildWipByDate(verifiedAssignedRows),
        materials: allMaterialView.materials,
      },
      centralSections,
      centralViews,
      qaTabs,
      qaViews,
      meta: {
        masterPlanNo,
        grain,
        isAdmin: Boolean(scope?.isAdmin),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
