import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

const COMPONENT_TYPE_MAP = {
  "03": "WIP",
  "01": "RAW",
  "02": "RAW",
  "04": "PACK",
  "04-1": "PACK",
  "04-2": "PACK",
};

function isMissingTableError(error, tableName) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes(`relation "${tableName}"`) || message.includes(tableName);
}

function normalizeText(value) {
  const normalized = normalizeParam(value);
  return normalized ?? null;
}

function normalizeUpper(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeComponentType(value, iccatCode) {
  const normalized = normalizeUpper(value);
  if (normalized && ["WIP", "RAW", "PACK"].includes(normalized)) return normalized;
  const byIccat = COMPONENT_TYPE_MAP[normalizeUpper(iccatCode)];
  return byIccat || "RAW";
}

function normalizeRoomMode(value) {
  const normalized = normalizeUpper(value);
  return normalized === "INHERIT_PARENT" ? "inherit_parent" : "explicit";
}

function normalizeDispatchSplitMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "split_by_material_type" ? "split_by_material_type" : "merge_all";
}

function normalizeUsageType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "PROCESS" ? "PROCESS" : "DIRECT";
}

async function findDepartment(supabaseAdmin, departmentId) {
  const { data, error } = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .eq("id", departmentId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("Failed to validate department");
  return data || null;
}

async function findWorkCenter(supabaseAdmin, departmentId, workCenterId) {
  const { data, error } = await supabaseAdmin
    .from("production_work_centers")
    .select("id,department_id,production_departments:department_id(is_central_department)")
    .eq("id", workCenterId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("Failed to validate work center");
  if (!data) return null;
  const isSameDepartment = String(data.department_id || "").trim() === String(departmentId || "").trim();
  const isCentralDepartment = data.production_departments?.is_central_department === true;
  return isSameDepartment || isCentralDepartment ? data : null;
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeText(searchParams.get("departmentId"));
    const fgSkuCode = normalizeUpper(searchParams.get("fgSkuCode"));
    const includeInactive = searchParams.get("includeInactive") === "true";

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_routing_components")
      .select([
        "id",
        "node_key",
        "parent_sku_code",
        "room_mode",
        "department_id",
        "fg_sku_code",
        "fg_sku_name",
        "component_sku_code",
        "component_sku_name",
        "component_type",
        "dispatch_split_mode",
        "usage_type",
        "issue_owner_department_id",
        "work_center_id",
        "remark",
        "is_active",
        "updated_at",
      ].join(","))
      .is("deleted_at", null)
      .order("component_type", { ascending: true })
      .order("component_sku_code", { ascending: true });

    if (departmentId) query = query.eq("department_id", departmentId);
    if (fgSkuCode) query = query.eq("fg_sku_code", fgSkuCode);
    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error, "production_routing_components")) {
        return Response.json({
          error: "Routing table is missing. Run migration 20260701_add_production_routing_components.sql first.",
        }, { status: 500 });
      }
      return Response.json({
        error: "Failed to load routing components",
        details: error.message || null,
        code: error.code || null,
      }, { status: 500 });
    }

    const workCenterIds = Array.from(
      new Set((data || []).map((row) => row.work_center_id).filter(Boolean))
    );
    let workCenterMap = new Map();
    if (workCenterIds.length) {
      const workCenterResult = await supabaseAdmin
        .from("production_work_centers")
        .select("id,code,name")
        .in("id", workCenterIds)
        .is("deleted_at", null);
      if (workCenterResult.error) {
        return Response.json({
          error: "Failed to load work center details",
          details: workCenterResult.error.message || null,
          code: workCenterResult.error.code || null,
        }, { status: 500 });
      }
      workCenterMap = new Map(
        (workCenterResult.data || []).map((row) => [row.id, row])
      );
    }

    return Response.json({
      data: (data || []).map((row) => ({
        id: row.id,
        node_key: row.node_key,
        parent_sku_code: row.parent_sku_code,
        room_mode: row.room_mode || "explicit",
        department_id: row.department_id,
        fg_sku_code: row.fg_sku_code,
        fg_sku_name: row.fg_sku_name,
        component_sku_code: row.component_sku_code,
        component_sku_name: row.component_sku_name,
        component_type: row.component_type,
        dispatch_split_mode: row.dispatch_split_mode || "merge_all",
        usage_type: normalizeUsageType(row.usage_type),
        issue_owner_department_id: row.issue_owner_department_id || null,
        work_center_id: row.work_center_id,
        work_center_code: workCenterMap.get(row.work_center_id)?.code || "",
        work_center_name: workCenterMap.get(row.work_center_id)?.name || "",
        remark: row.remark || "",
        is_active: Boolean(row.is_active),
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const body = await readJson(request);

    const departmentId = normalizeText(body.departmentId);
    const fgSkuCode = normalizeUpper(body.fgSkuCode);
    const fgSkuName = normalizeText(body.fgSkuName);
    const remark = normalizeText(body.remark);
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];

    if (!departmentId || !fgSkuCode || !fgSkuName || !mappings.length) {
      return Response.json({ error: "departmentId, fgSkuCode, fgSkuName and mappings are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const department = await findDepartment(supabaseAdmin, departmentId);
    if (!department) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }

    const insertRows = [];
    const dedup = new Set();
    for (const mapping of mappings) {
      const componentSkuCode = normalizeUpper(mapping.componentSkuCode);
      const componentSkuName = normalizeText(mapping.componentSkuName);
      const componentType = normalizeComponentType(mapping.componentType, mapping.iccatCode);
      const nodeKey = normalizeText(mapping.nodeKey);
      const parentSkuCode = normalizeUpper(mapping.parentSkuCode);
      const isParentFg = parentSkuCode === fgSkuCode;
      const roomMode = isParentFg ? "explicit" : normalizeRoomMode(mapping.roomMode);
      const workCenterId = normalizeText(mapping.workCenterId);
      const dispatchSplitMode = normalizeDispatchSplitMode(mapping.dispatchSplitMode);
      const usageType = normalizeUsageType(mapping.usageType);
      const issueOwnerDepartmentId = normalizeText(mapping.issueOwnerDepartmentId);
      if (issueOwnerDepartmentId) {
        const issueOwnerDepartment = await findDepartment(supabaseAdmin, issueOwnerDepartmentId);
        if (!issueOwnerDepartment) {
          return Response.json({ error: `Issue owner department invalid for ${componentSkuCode}` }, { status: 400 });
        }
      }
      if (!componentSkuCode || !componentSkuName || !nodeKey || !parentSkuCode) {
        continue;
      }
      const dedupKey = nodeKey;
      if (dedup.has(dedupKey)) continue;
      dedup.add(dedupKey);

      let resolvedWorkCenterId = null;
      if (roomMode === "explicit") {
        const workCenter = await findWorkCenter(supabaseAdmin, departmentId, workCenterId);
        if (!workCenter) {
          return Response.json({ error: `Work center invalid for ${componentSkuCode}` }, { status: 400 });
        }
        resolvedWorkCenterId = workCenterId;
      }

      insertRows.push({
        node_key: nodeKey,
        parent_sku_code: parentSkuCode,
        room_mode: roomMode,
        department_id: departmentId,
        fg_sku_code: fgSkuCode,
        fg_sku_name: fgSkuName,
        component_sku_code: componentSkuCode,
        component_sku_name: componentSkuName,
        component_type: componentType,
        dispatch_split_mode: dispatchSplitMode,
        usage_type: usageType,
        issue_owner_department_id: issueOwnerDepartmentId,
        work_center_id: resolvedWorkCenterId,
        remark,
        is_active: true,
        created_by: userId,
        updated_by: userId,
      });
    }

    if (!insertRows.length) {
      return Response.json({ error: "No valid mappings to save" }, { status: 400 });
    }

    await supabaseAdmin
      .from("production_routing_components")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("department_id", departmentId)
      .eq("fg_sku_code", fgSkuCode)
      .is("deleted_at", null);

    const { error } = await supabaseAdmin
      .from("production_routing_components")
      .insert(insertRows);

    if (error) {
      return Response.json({ error: "Failed to save routing components" }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
