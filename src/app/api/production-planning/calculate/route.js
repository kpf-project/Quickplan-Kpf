import { jsonError, getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getUserPermissions } from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { toJsonResponse } from "@/lib/result";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { calculateMaterialsFromData } from "@/features/production-planning/services/calculationLogic";

const normalizeSku = (value) => String(value || "").trim().toUpperCase();

function extractMasterPlanNo(payload = {}) {
  const raw = String(payload?.masterPlanNo || payload?.planNo || "").trim().toUpperCase();
  if (!raw) return { value: null, raw: "" };
  return { value: normalizeMasterPlanNo(raw) || null, raw };
}

function extractItemMasterPlanNoRaw(item = {}) {
  return String(
    item?.masterPlanNo
    || item?.master_plan_no
    || item?.planGroupId
    || item?.plan_group_id
    || item?.planNo
    || item?.plan_no
    || ""
  ).trim().toUpperCase();
}

function extractItemMasterPlanNo(item = {}) {
  const raw = extractItemMasterPlanNoRaw(item);
  if (!raw) return null;
  return normalizeMasterPlanNo(raw) || null;
}

async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const session = getSessionFromRequest(request, userId);
  if (session?.isAdmin) return true;
  if (Array.isArray(session?.permissions)) {
    return session.permissions.includes("production-line-planning-manage");
  }
  const permissionResult = await getUserPermissions(userId);
  return Boolean(
    permissionResult?.isAdmin
    || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

async function loadEditableSkuSet(supabaseAdmin, userId) {
  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role")
    .eq("user_id", userId);
  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const departmentIds = Array.from(
    new Set((membershipResult.data ?? []).map((row) => String(row?.department_id || "")).filter(Boolean))
  );
  if (!departmentIds.length) {
    return new Set();
  }

  const activeResult = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .in("id", departmentIds)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (activeResult.error) {
    throw activeResult.error;
  }

  const activeSet = new Set((activeResult.data ?? []).map((row) => String(row.id)));
  const editorDepartments = (membershipResult.data ?? [])
    .filter((row) => row?.role === "editor" && activeSet.has(String(row?.department_id || "")))
    .map((row) => String(row.department_id));
  if (!editorDepartments.length) {
    return new Set();
  }

  const mappedResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .in("department_id", editorDepartments)
    .eq("is_owner", true);
  if (mappedResult.error) {
    throw mappedResult.error;
  }

  return new Set(
    (mappedResult.data ?? [])
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const body = await request.json().catch(() => ({}));
    const plannedItems = Array.isArray(body?.plannedItems) ? body.plannedItems : [];
    if (!plannedItems.length) {
      return Response.json({ error: "plannedItems is required" }, { status: 400 });
    }

    const { value: normalizedMasterPlanNo, raw: rawMasterPlanNo } = extractMasterPlanNo(body);
    const inferredRawMasterPlanNo = plannedItems
      .map((item) => extractItemMasterPlanNoRaw(item))
      .find(Boolean) || "";
    const effectiveRawMasterPlanNo = rawMasterPlanNo || inferredRawMasterPlanNo;
    if (!effectiveRawMasterPlanNo) {
      return Response.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    // Keep compatibility with legacy/temporary plan identifiers used in older flows.
    const masterPlanNo = normalizedMasterPlanNo || effectiveRawMasterPlanNo;

    if (normalizedMasterPlanNo) {
      const mismatchedPlanItems = plannedItems
        .map((item, idx) => ({
          index: idx,
          itemMasterPlanNo: extractItemMasterPlanNo(item),
        }))
        .filter((row) => row.itemMasterPlanNo && row.itemMasterPlanNo !== normalizedMasterPlanNo);
      if (mismatchedPlanItems.length) {
        return Response.json(
          {
            error: "Plan No mismatch in plannedItems",
            details: {
              masterPlanNo: normalizedMasterPlanNo,
              mismatchedIndexes: mismatchedPlanItems.map((row) => row.index),
            },
          },
          { status: 400 }
        );
      }
    } else {
      const mismatchedRawPlanItems = plannedItems
        .map((item, idx) => ({
          index: idx,
          itemMasterPlanNoRaw: extractItemMasterPlanNoRaw(item),
        }))
        .filter(
          (row) =>
            row.itemMasterPlanNoRaw
            && row.itemMasterPlanNoRaw !== effectiveRawMasterPlanNo
        );
      if (mismatchedRawPlanItems.length) {
        return Response.json(
          {
            error: "Plan No mismatch in plannedItems",
            details: {
              masterPlanNo: effectiveRawMasterPlanNo,
              mismatchedIndexes: mismatchedRawPlanItems.map((row) => row.index),
            },
          },
          { status: 400 }
        );
      }
    }

    const supabaseAdmin = getSupabaseAdmin();
    const canManageGlobal = await hasPlanningManageAccess(
      request,
      permission.userId,
      permission.isAdmin
    );
    if (!permission.isAdmin && !canManageGlobal) {
      const editableSkuSet = await loadEditableSkuSet(supabaseAdmin, permission.userId);
      const unauthorizedSkuSet = new Set(
        plannedItems
          .map((item) => normalizeSku(item?.skuCode || item?.sku_code))
          .filter((sku) => sku && !editableSkuSet.has(sku))
      );
      if (unauthorizedSkuSet.size > 0) {
        return Response.json(
          {
            error: "Department scope violation",
            details: { skuCodes: Array.from(unauthorizedSkuSet) },
          },
          { status: 403 }
        );
      }
    }

    const result = await calculateMaterialsFromData(
      {
        ...body,
        masterPlanNo,
        planNo: masterPlanNo,
      },
      request
    );
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
