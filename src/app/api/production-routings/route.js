import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeRoutingInput, normalizeRoutingQuery } from "@/lib/productionRoutings";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function findDepartment(supabaseAdmin, departmentId) {
  const { data, error } = await supabaseAdmin
    .from("production_departments")
    .select("id,code,name")
    .eq("id", departmentId)
    .is("deleted_at", null)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to validate department");
  }
  return data || null;
}

async function findWorkCenters(supabaseAdmin, departmentId, workCenterIds) {
  const { data, error } = await supabaseAdmin
    .from("production_work_centers")
    .select("id,department_id")
    .in("id", workCenterIds)
    .eq("department_id", departmentId)
    .is("deleted_at", null)
    .eq("is_active", true);

  if (error) {
    throw new Error("Failed to validate work centers");
  }
  return data || [];
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const filters = normalizeRoutingQuery({
      search: searchParams.get("search"),
      departmentId: searchParams.get("departmentId"),
      itemType: searchParams.get("itemType"),
      includeInactive: searchParams.get("includeInactive"),
    });
    const searchLower = filters.search.toLowerCase();

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_routings")
      .select([
        "id",
        "department_id",
        "sku_code",
        "sku_name",
        "item_type",
        "work_center_id",
        "remark",
        "is_active",
        "created_at",
        "updated_at",
        "production_departments:department_id(code,name)",
        "production_work_centers:work_center_id(code,name)",
      ].join(","))
      .is("deleted_at", null)
      .order("item_type", { ascending: true })
      .order("sku_code", { ascending: true })
      .order("created_at", { ascending: true });

    if (filters.departmentId) {
      query = query.eq("department_id", filters.departmentId);
    }
    if (filters.itemType) {
      query = query.eq("item_type", filters.itemType);
    }
    if (!filters.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load production routings" }, { status: 500 });
    }

    const grouped = new Map();
    for (const row of data ?? []) {
      const routeKey = `${row.department_id}|${row.item_type}|${row.sku_code}`;
      if (!grouped.has(routeKey)) {
        grouped.set(routeKey, {
          route_key: routeKey,
          department_id: row.department_id,
          department_code: row.production_departments?.code || "",
          department_name: row.production_departments?.name || "",
          sku_code: row.sku_code,
          sku_name: row.sku_name,
          item_type: row.item_type,
          remark: row.remark || "",
          is_active: Boolean(row.is_active),
          created_at: row.created_at,
          updated_at: row.updated_at,
          work_centers: [],
        });
      }
      const target = grouped.get(routeKey);
      target.work_centers.push({
        id: row.work_center_id,
        code: row.production_work_centers?.code || "",
        name: row.production_work_centers?.name || "",
      });
      if (new Date(row.updated_at).getTime() > new Date(target.updated_at).getTime()) {
        target.updated_at = row.updated_at;
      }
    }

    const result = Array.from(grouped.values()).filter((row) => {
      if (!searchLower) return true;
      return (
        normalizedLower(row.sku_code).includes(searchLower)
        || normalizedLower(row.sku_name).includes(searchLower)
        || normalizedLower(row.department_code).includes(searchLower)
        || normalizedLower(row.department_name).includes(searchLower)
      );
    });

    return Response.json({ data: result });
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
    const input = normalizeRoutingInput(body);

    if (input.errors.length) {
      return Response.json({ error: "Invalid routing input", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const department = await findDepartment(supabaseAdmin, input.departmentId);
    if (!department) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }

    const workCenters = await findWorkCenters(supabaseAdmin, input.departmentId, input.workCenterIds);
    if (workCenters.length !== input.workCenterIds.length) {
      return Response.json({ error: "Some work centers are invalid for this department" }, { status: 400 });
    }

    await supabaseAdmin
      .from("production_routings")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("department_id", input.departmentId)
      .eq("sku_code", input.skuCode)
      .eq("item_type", input.itemType)
      .is("deleted_at", null);

    const insertRows = input.workCenterIds.map((workCenterId) => ({
      department_id: input.departmentId,
      sku_code: input.skuCode,
      sku_name: input.skuName,
      item_type: input.itemType,
      work_center_id: workCenterId,
      remark: input.remark,
      is_active: input.isActive,
      created_by: userId,
      updated_by: userId,
    }));

    const { error } = await supabaseAdmin
      .from("production_routings")
      .insert(insertRows);

    if (error) {
      return Response.json({ error: "Failed to save production routing" }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const body = await readJson(request);
    const departmentId = String(body?.departmentId || "").trim();
    const skuCode = String(body?.skuCode || "").trim().toUpperCase();
    const itemType = String(body?.itemType || "").trim().toUpperCase();

    if (!departmentId || !skuCode || (itemType !== "FG" && itemType !== "WIP")) {
      return Response.json({ error: "departmentId, skuCode and itemType are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_routings")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("department_id", departmentId)
      .eq("sku_code", skuCode)
      .eq("item_type", itemType)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: "Failed to deactivate routing" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
