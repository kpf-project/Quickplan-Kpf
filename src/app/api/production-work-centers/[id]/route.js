import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  mapWorkCenterRow,
  normalizeWorkCenterInput,
} from "@/lib/productionWorkCenters";

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function findActiveDepartment(supabaseAdmin, departmentId) {
  const { data, error } = await supabaseAdmin
    .from("production_departments")
    .select("id")
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
  excludeId,
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

async function loadWorkCenter(supabaseAdmin, id) {
  const { data, error } = await supabaseAdmin
    .from("production_work_centers")
    .select("id,department_id,delivery_point_id,code,name,production_departments:department_id(code,name)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to load work center");
  }
  return data || null;
}

export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const workCenter = await loadWorkCenter(supabaseAdmin, id);
    if (!workCenter) {
      return Response.json({ error: "Work center not found" }, { status: 404 });
    }

    const { data: routingRows, error: routingError } = await supabaseAdmin
      .from("production_routing_components")
      .select(`
        id,
        department_id,
        fg_sku_code,
        fg_sku_name,
        component_sku_code,
        component_sku_name,
        component_type,
        production_departments:department_id(code,name)
      `)
      .eq("work_center_id", id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("fg_sku_code", { ascending: true })
      .order("component_sku_code", { ascending: true });

    if (routingError) {
      return Response.json({ error: "Failed to load work center impact" }, { status: 500 });
    }

    const impacts = (routingRows || []).map((row) => ({
      id: row.id,
      departmentId: row.department_id,
      departmentCode: row.production_departments?.code || "",
      departmentName: row.production_departments?.name || "",
      fgSkuCode: row.fg_sku_code || "",
      fgSkuName: row.fg_sku_name || "",
      componentSkuCode: row.component_sku_code || "",
      componentSkuName: row.component_sku_name || "",
      componentType: row.component_type || "",
    }));

    return Response.json({
      data: {
        workCenter: {
          id: workCenter.id,
          departmentId: workCenter.department_id,
          deliveryPointId: workCenter.delivery_point_id || "",
          departmentCode: workCenter.production_departments?.code || "",
          departmentName: workCenter.production_departments?.name || "",
          code: workCenter.code || "",
          name: workCenter.name || "",
        },
        impacts,
        impactCount: impacts.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const { id } = await params;
    const body = await readJson(request);
    const input = normalizeWorkCenterInput(body);

    if (input.errors.length) {
      return Response.json({ error: "Invalid work center", details: input.errors }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadWorkCenter(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Work center not found" }, { status: 404 });
    }

    const department = await findActiveDepartment(supabaseAdmin, input.departmentId);
    if (!department) {
      return Response.json({ error: "Invalid department" }, { status: 400 });
    }

    const { duplicateCode, duplicateName } = await findDuplicateWorkCenter({
      supabaseAdmin,
      departmentId: input.departmentId,
      code: input.code,
      name: input.name,
      excludeId: id,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate work center code in department" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate work center name in department" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_work_centers")
      .update({
        department_id: input.departmentId,
        delivery_point_id: input.deliveryPointId,
        code: input.code,
        name: input.name,
        description: input.description,
        sort_order: input.sortOrder,
        is_active: input.isActive,
        consolidate_requisition_preview_by_date: input.consolidateRequisitionPreviewByDate,
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null)
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
      return Response.json({ error: "Failed to update work center" }, { status: 500 });
    }

    return Response.json({ data: mapWorkCenterRow(data) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    const existing = await loadWorkCenter(supabaseAdmin, id);
    if (!existing) {
      return Response.json({ error: "Work center not found" }, { status: 404 });
    }

    const { error: routingError } = await supabaseAdmin
      .from("production_routing_components")
      .update({
        work_center_id: null,
        updated_by: userId,
      })
      .eq("work_center_id", id)
      .is("deleted_at", null);

    if (routingError) {
      return Response.json({ error: "Failed to clear routing work center references" }, { status: 500 });
    }

    const { error } = await supabaseAdmin
      .from("production_work_centers")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) {
      return Response.json({ error: "Failed to delete work center" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
