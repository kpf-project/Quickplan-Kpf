import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { normalizeClaimGrain, normalizeSku } from "@/lib/materialClaims";
import {
  canEditAssignedDepartment,
  loadMaterialOwnerMap,
  loadVerifyEditorScope,
  resolveAssignedDepartment,
  UNASSIGNED_DEPARTMENT_ID,
  UNASSIGNED_DEPARTMENT_NAME,
} from "@/lib/materialVerify";
import { annotateRowsWithMaterialVerification } from "@/lib/materialVerifyConfirmations";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

const MATERIAL_TAB_ID = "all";
function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
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
    if (String(row?.demandSource || "").trim() !== "subplan_raw") return;
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

function buildMaterialView(rows, scope) {
  const materialMap = new Map();
  const dateSet = new Set();

  rows.forEach((row) => {
    const materialSkuCode = normalizeSku(row?.materialSkuCode);
    const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
    const materialKey = materialGoodsCode || materialSkuCode;
    if (!materialKey) return;

    const bucketDate = String(row?.bucketDate || "").trim();
    if (bucketDate) dateSet.add(bucketDate);

    const assignedDepartmentId = String(row?.assignedDepartmentId || "").trim() || UNASSIGNED_DEPARTMENT_ID;
    const assignedDepartmentName = String(row?.assignedDepartmentName || "").trim() || UNASSIGNED_DEPARTMENT_NAME;
    const canEdit = canEditAssignedDepartment(scope, assignedDepartmentId);

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

    if (!bucketDate) return;

    const material = materialMap.get(materialKey);
    if (!material.byDate[bucketDate]) {
      material.byDate[bucketDate] = {
        totalQty: 0,
        totalRows: 0,
        claimedRows: 0,
        unclaimedRows: 0,
        verifiedRows: 0,
        unclaimedVerifiedRows: 0,
        byDept: {},
      };
    }

    const cell = material.byDate[bucketDate];
    const qty = Number(row?.issueQty ?? row?.requiredQty ?? 0);
    const isClaimed = String(row?.claimStatus || "").trim().toLowerCase() === "claimed";
    cell.totalQty += qty;
    cell.totalRows += 1;
    if (isClaimed) {
      cell.claimedRows += 1;
    } else {
      cell.unclaimedRows += 1;
    }
    if (row?.materialVerified) {
      cell.verifiedRows += 1;
      if (!isClaimed) {
        cell.unclaimedVerifiedRows += 1;
      }
    }

    if (!cell.byDept[assignedDepartmentId]) {
      cell.byDept[assignedDepartmentId] = {
        deptId: assignedDepartmentId,
        deptName: assignedDepartmentName,
        qty: 0,
        totalRows: 0,
        verifiedRows: 0,
        allClaimed: true,
        verified: false,
        canEdit,
      };
    }

    const deptCell = cell.byDept[assignedDepartmentId];
    deptCell.qty += qty;
    deptCell.totalRows += 1;
    if (row?.materialVerified) {
      deptCell.verifiedRows += 1;
    }
    deptCell.verified = deptCell.totalRows > 0 && deptCell.verifiedRows === deptCell.totalRows;
    if (!isClaimed) {
      deptCell.allClaimed = false;
    }
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

function buildPlanTabs(rows) {
  const tabMap = new Map();

  rows.forEach((row) => {
    const departmentId = String(row?.ownerDepartmentId || "").trim();
    if (!departmentId) return;

    if (!tabMap.has(departmentId)) {
      tabMap.set(departmentId, {
        id: `dept:${departmentId}`,
        deptId: departmentId,
        label: String(row?.ownerDepartmentName || row?.ownerDepartmentCode || departmentId).trim(),
      });
    }
  });

  return Array.from(tabMap.values()).sort((left, right) => (
    String(left.label || "").localeCompare(String(right.label || ""), "th")
  ));
}

function buildPlanViews(rows) {
  const tabs = buildPlanTabs(rows);
  const views = {};

  tabs.forEach((tab) => {
    const deptRows = rows.filter((row) => String(row?.ownerDepartmentId || "").trim() === String(tab.deptId || ""));
    const materialView = buildMaterialView(deptRows, { isAdmin: false, deptIds: [] });
    views[tab.id] = {
      deptId: tab.deptId,
      label: tab.label,
      wipByDate: buildWipByDate(deptRows),
      materials: materialView.materials,
    };
  });

  return { tabs, views };
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, ["plan.verify_materials"]);
    const { searchParams } = new URL(request.url);

    const inputMasterPlanNo = normalizeParam(searchParams.get("masterPlanNo") || searchParams.get("planNo"));
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const grain = normalizeClaimGrain(searchParams.get("grain") || "daily", "daily");
    const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
    const dateTo = normalizeDateOnly(searchParams.get("dateTo"));

    if (!masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [scope, pool, ownerByMaterialKey] = await Promise.all([
      loadVerifyEditorScope(supabaseAdmin, permission.userId, permission.isAdmin),
      buildClaimPoolRows(supabaseAdmin, { masterPlanNo, grain, dateFrom, dateTo }),
      loadMaterialOwnerMap(supabaseAdmin),
    ]);

    const baseRows = Array.isArray(pool?.rawRows) && pool.rawRows.length > 0
      ? pool.rawRows
      : (Array.isArray(pool?.rows) ? pool.rows : []);

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

    const materialRows = scope.isAdmin
      ? verifiedAssignedRows
      : verifiedAssignedRows.filter((row) => {
          const assignedDepartmentId = String(row?.assignedDepartmentId || "").trim();
          return assignedDepartmentId && scope.deptIds.includes(assignedDepartmentId);
        });

    const materialView = buildMaterialView(materialRows, scope);
    const planViews = buildPlanViews(verifiedAssignedRows);

    return NextResponse.json({
      dates: materialView.dates,
      materialView: {
        tab: { id: MATERIAL_TAB_ID, label: "รวมวัตถุดิบที่รับผิดชอบ" },
        wipByDate: buildWipByDate(materialRows),
        materials: materialView.materials,
      },
      planTabs: planViews.tabs,
      planViews: planViews.views,
      meta: {
        masterPlanNo,
        grain,
        isAdmin: scope.isAdmin,
        isQaMode: false,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

