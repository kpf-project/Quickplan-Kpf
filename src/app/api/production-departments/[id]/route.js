import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

function normalizeDepartmentCode(value) {
  const normalized = normalizeParam(value);
  if (!normalized) return null;
  return normalized.toUpperCase();
}

function normalizeDepartmentName(value) {
  return normalizeParam(value);
}

function normalizeDescription(value) {
  const normalized = normalizeParam(value);
  return normalized ?? null;
}

function normalizeIsCentralDepartment(value) {
  return value === true;
}

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

async function findDuplicateDepartment({ supabaseAdmin, code, name, excludeId = null }) {
  const { data, error } = await supabaseAdmin
    .from("production_departments")
    .select("id,code,name")
    .is("deleted_at", null);

  if (error) {
    throw new Error("Failed to validate duplicate department");
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

async function findPendingPlansByDepartment({ supabaseAdmin, departmentId }) {
  const byOwnerCountResult = await supabaseAdmin
    .from("production_plan_status")
    .select("plan_id", { count: "exact", head: true })
    .eq("owner_department_id", departmentId)
    .eq("status", "not_ready");

  if (!byOwnerCountResult.error) {
    const sampleResult = await supabaseAdmin
      .from("production_plan_status")
      .select("plan_id,sku_code,period_start,period_end")
      .eq("owner_department_id", departmentId)
      .eq("status", "not_ready")
      .order("period_start", { ascending: true })
      .limit(5);
    if (sampleResult.error) {
      throw new Error("Failed to load pending plan samples");
    }
    return {
      count: Number(byOwnerCountResult.count || 0),
      plans: sampleResult.data ?? [],
    };
  }

  const mappedResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .eq("department_id", departmentId);
  if (mappedResult.error) {
    throw new Error("Failed to load mapped products");
  }

  const skuCodes = Array.from(
    new Set(
      (mappedResult.data ?? [])
        .map((row) => String(row?.sku_code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (!skuCodes.length) {
    return { count: 0, plans: [] };
  }

  const countResult = await supabaseAdmin
    .from("production_plan_status")
    .select("plan_id", { count: "exact", head: true })
    .in("sku_code", skuCodes)
    .eq("status", "not_ready");
  if (countResult.error) {
    throw new Error("Failed to validate pending plans");
  }

  const sampleResult = await supabaseAdmin
    .from("production_plan_status")
    .select("plan_id,sku_code,period_start,period_end")
    .in("sku_code", skuCodes)
    .eq("status", "not_ready")
    .order("period_start", { ascending: true })
    .limit(5);
  if (sampleResult.error) {
    throw new Error("Failed to load pending plan samples");
  }

  return {
    count: Number(countResult.count || 0),
    plans: sampleResult.data ?? [],
  };
}

export async function PUT(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);

    const { id } = await params;
    const departmentId = normalizeParam(id);
    if (!departmentId) {
      return Response.json({ error: "Department id is required" }, { status: 400 });
    }

    const body = await readJson(request);
    const code = normalizeDepartmentCode(body.code);
    const name = normalizeDepartmentName(body.name);
    const description = normalizeDescription(body.description);
    const isActive = body.is_active !== false;
    const isCentralDepartment = normalizeIsCentralDepartment(body.is_central_department);

    if (!code || !name) {
      return Response.json({ error: "Department code and name are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { duplicateCode, duplicateName } = await findDuplicateDepartment({
      supabaseAdmin,
      code,
      name,
      excludeId: departmentId,
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate department code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate department name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_departments")
      .update({
        code,
        name,
        description,
        is_active: isActive,
        is_central_department: isCentralDepartment,
        updated_by: userId,
      })
      .eq("id", departmentId)
      .is("deleted_at", null)
      .select("id,code,name,description,is_active,is_central_department,created_at,updated_at")
      .maybeSingle();

    if (error) {
      if (String(error.message || "").toLowerCase().includes("production_departments_code_unique")) {
        return Response.json({ error: "Duplicate department code" }, { status: 409 });
      }
      if (String(error.message || "").toLowerCase().includes("production_departments_name_unique")) {
        return Response.json({ error: "Duplicate department name" }, { status: 409 });
      }
      return Response.json({ error: "Failed to update production department" }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Production department not found" }, { status: 404 });
    }

    return Response.json({ data });
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
    const departmentId = normalizeParam(id);
    if (!departmentId) {
      return Response.json({ error: "Department id is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const pending = await findPendingPlansByDepartment({
      supabaseAdmin,
      departmentId,
    });
    if (pending.count > 0) {
      return Response.json({
        error: "Cannot deactivate department with pending production plans",
        details: {
          pendingCount: pending.count,
          samplePlans: pending.plans,
        },
      }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_departments")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("id", departmentId)
      .is("deleted_at", null)
      .select("id,code,name,description,is_active,is_central_department,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to deactivate production department" }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Production department not found" }, { status: 404 });
    }

    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
