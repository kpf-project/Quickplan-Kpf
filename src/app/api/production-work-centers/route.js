import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  mapWorkCenterRow,
  normalizeWorkCenterInput,
  normalizeWorkCenterQuery,
} from "@/lib/productionWorkCenters";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function findActiveDepartment(supabaseAdmin, departmentId) {
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

async function findDuplicateWorkCenter({
  supabaseAdmin,
  departmentId,
  code,
  name,
  excludeId = null,
}) {
  const { data, error } = await supabaseAdmin
    .from("production_work_centers")
    .select("id,code,name")
    .eq("department_id", departmentId)
    .is("deleted_at", null);

  if (error) {
    throw new Error("Failed to validate duplicate work center");
  }

  const targetCode = normalizedLower(code);
  const targetName = normalizedLower(name);
  const duplicateCode = (data ?? []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    return normalizedLower(row.code) === targetCode;
  });
  const duplicateName = (data ?? []).find((row) => {
    if (excludeId && row.id === excludeId) return false;
    return normalizedLower(row.name) === targetName;
  });

  return { duplicateCode, duplicateName };
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const filters = normalizeWorkCenterQuery({
      search: searchParams.get("search"),
      departmentId: searchParams.get("departmentId"),
      includeInactive: searchParams.get("includeInactive"),
    });
    const searchLower = filters.search.toLowerCase();

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_work_centers")
      .select(`
        id,
        department_id,
        delivery_point_id,
        code,
        name,
        description,
        sort_order,
        is_active,
        consolidate_requisition_preview_by_date,
        created_at,
        updated_at,
        production_departments:department_id(code,name,is_central_department),
        production_delivery_points:delivery_point_id(code,name)
      `)
      .is("deleted_at", null)
      .order("department_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (filters.departmentId) {
      query = query.eq("department_id", filters.departmentId);
    }
    if (!filters.includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load work centers" }, { status: 500 });
    }

    const rows = (data ?? [])
      .map(mapWorkCenterRow)
      .filter((row) => {
        if (!searchLower) return true;
        return (
          String(row.code || "").toLowerCase().includes(searchLower)
          || String(row.name || "").toLowerCase().includes(searchLower)
          || String(row.department_code || "").toLowerCase().includes(searchLower)
          || String(row.department_name || "").toLowerCase().includes(searchLower)
        );
      });

    return Response.json({ data: rows });
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
    const input = normalizeWorkCenterInput(body);

    if (input.errors.length) {
      return Response.json({ error: "Invalid work center", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const department = await findActiveDepartment(supabaseAdmin, input.departmentId);
    if (!department) {
      return Response.json({ error: "Invalid department" }, { status: 400 });
    }

    const { duplicateCode, duplicateName } = await findDuplicateWorkCenter({
      supabaseAdmin,
      departmentId: input.departmentId,
      code: input.code,
      name: input.name,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate work center code in department" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate work center name in department" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_work_centers")
      .insert({
        department_id: input.departmentId,
        delivery_point_id: input.deliveryPointId,
        code: input.code,
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        consolidate_requisition_preview_by_date: input.consolidateRequisitionPreviewByDate,
        created_by: userId,
        updated_by: userId,
      })
      .select(`
        id,
        department_id,
        delivery_point_id,
        code,
        name,
        description,
        sort_order,
        is_active,
        consolidate_requisition_preview_by_date,
        created_at,
        updated_at,
        production_departments:department_id(code,name,is_central_department),
        production_delivery_points:delivery_point_id(code,name)
      `)
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to create work center" }, { status: 500 });
    }

    return Response.json({ data: mapWorkCenterRow(data) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
