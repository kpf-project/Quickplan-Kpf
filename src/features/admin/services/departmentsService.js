import {
  ApiError,
  getSupabaseAdmin,
  readJson,
  requireAdmin,
} from "@/lib/adminApi";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function uniqueDepartments(departments) {
  const seen = new Set();
  return departments.filter((department) => {
    if (!department?.external_code || !department?.name) {
      return false;
    }
    if (seen.has(department.external_code)) {
      return false;
    }
    seen.add(department.external_code);
    return true;
  });
}

async function fetchHrDepartments() {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    return [];
  }

  try {
    const response = await fetch(`${gatewayUrl}/api/hr-departments`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json().catch(() => ({}));
    return payload?.departments ?? [];
  } catch (error) {
    return [];
  }
}

async function syncHrDepartments(supabaseAdmin) {
  const rawDepartments = await fetchHrDepartments();
  if (!rawDepartments.length) {
    return;
  }

  const normalized = rawDepartments.map((department) => {
    const externalCode = normalizeString(
      department.external_code ?? department.id ?? ""
    );
    const name = normalizeString(department.name ?? "");
    return {
      external_code: externalCode,
      name,
      source: "hr",
      is_active: true,
    };
  });

  const unique = uniqueDepartments(normalized);
  if (!unique.length) {
    return;
  }

  const externalCodes = unique.map((department) => department.external_code);
  const { data: existingDepartments, error: existingError } =
    await supabaseAdmin
      .from("departments")
      .select("external_code")
      .in("external_code", externalCodes);
  if (existingError) {
    throw new ApiError(500, "Failed to sync departments", existingError.message);
  }

  const existingCodes = new Set(
    (existingDepartments ?? [])
      .map((department) => department.external_code)
      .filter(Boolean)
  );

  const inserts = unique.filter(
    (department) => !existingCodes.has(department.external_code)
  );
  if (!inserts.length) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("departments")
    .insert(inserts);
  if (insertError) {
    throw new ApiError(500, "Failed to sync departments", insertError.message);
  }
}

export async function listDepartments(request) {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const shouldSync = searchParams.get("sync_hr") === "1";
  if (shouldSync) {
    await syncHrDepartments(supabaseAdmin);
  }
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id, name, source, external_code, is_active, created_at, updated_at")
    .order("name", { ascending: true });
  if (error) {
    throw new ApiError(500, "Failed to load departments", error.message);
  }
  return Response.json({ departments: data ?? [] });
}

export async function createDepartment(request) {
  await requireAdmin(request);
  const body = await readJson(request);
  const name = normalizeString(body.name);
  if (!name) {
    throw new ApiError(400, "Department name is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: department, error } = await supabaseAdmin
    .from("departments")
    .insert({
      name,
      source: "custom",
      is_active: true,
    })
    .select("id, name, source, external_code, is_active, created_at, updated_at")
    .single();
  if (error) {
    throw new ApiError(400, "Failed to create department", error.message);
  }

  return Response.json({ department }, { status: 201 });
}
