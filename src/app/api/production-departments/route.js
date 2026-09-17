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

async function loadCountsByDepartment(supabaseAdmin, departmentIds = []) {
  if (!departmentIds.length) {
    return { productsByDept: new Map(), usersByDept: new Map() };
  }

  const [productsResult, usersResult] = await Promise.all([
    supabaseAdmin
      .from("production_department_products")
      .select("department_id")
      .in("department_id", departmentIds),
    supabaseAdmin
      .from("production_department_users")
      .select("department_id")
      .in("department_id", departmentIds),
  ]);

  if (productsResult.error) {
    throw new Error("Failed to load department-product counts");
  }
  if (usersResult.error) {
    throw new Error("Failed to load department-user counts");
  }

  const productsByDept = new Map();
  const usersByDept = new Map();

  (productsResult.data ?? []).forEach((row) => {
    const key = row.department_id;
    productsByDept.set(key, (productsByDept.get(key) ?? 0) + 1);
  });
  (usersResult.data ?? []).forEach((row) => {
    const key = row.department_id;
    usersByDept.set(key, (usersByDept.get(key) ?? 0) + 1);
  });

  return { productsByDept, usersByDept };
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search")) ?? "";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_departments")
      .select("id,code,name,description,is_active,is_central_department,created_at,updated_at")
      .is("deleted_at", null)
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load production departments" }, { status: 500 });
    }

    const rows = data ?? [];
    const ids = rows.map((row) => row.id);
    const { productsByDept, usersByDept } = await loadCountsByDepartment(supabaseAdmin, ids);

    const payload = rows.map((row) => ({
      ...row,
      product_count: productsByDept.get(row.id) ?? 0,
      user_count: usersByDept.get(row.id) ?? 0,
    }));

    return Response.json({ data: payload });
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
    });
    if (duplicateCode) {
      return Response.json({ error: "Duplicate department code" }, { status: 409 });
    }
    if (duplicateName) {
      return Response.json({ error: "Duplicate department name" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_departments")
      .insert({
        code,
        name,
        description,
        is_active: isActive,
        is_central_department: isCentralDepartment,
        created_by: userId,
        updated_by: userId,
      })
      .select("id,code,name,description,is_active,is_central_department,created_at,updated_at")
      .maybeSingle();

    if (error) {
      if (String(error.message || "").toLowerCase().includes("production_departments_code_unique")) {
        return Response.json({ error: "Duplicate department code" }, { status: 409 });
      }
      if (String(error.message || "").toLowerCase().includes("production_departments_name_unique")) {
        return Response.json({ error: "Duplicate department name" }, { status: 409 });
      }
      return Response.json({ error: "Failed to create production department" }, { status: 500 });
    }

    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
