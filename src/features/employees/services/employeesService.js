import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { createAppError, fail, ok } from "@/lib/result";

export async function listEmployees(request) {
  await requirePermissionKeys(request, ["admin-employees"]);
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();

  if (!gatewayUrl) {
    return fail(createAppError("config", "Gateway URL not configured"), { status: 500 });
  }

  const endpoint = queryString
    ? `${gatewayUrl}/api/employees?${queryString}`
    : `${gatewayUrl}/api/employees`;

  try {
    const response = await fetch(endpoint, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      next: { revalidate: 300, tags: ['employee-data'] }, // Cache for 5 minutes
    });
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const employeeCodes = Array.from(new Set(rows
      .map((row) => String(row?.PRS_NO ?? row?.EMP_INTL ?? "").trim())
      .filter(Boolean)));
    if (employeeCodes.length) {
      const { data: photoRows } = await getSupabaseAdmin()
        .from("employee_photos")
        .select("employee_code")
        .in("employee_code", employeeCodes);
      const photoCodes = new Set((photoRows || []).map((row) => row.employee_code));
      payload.data = rows.map((row) => {
        const employeeCode = String(row?.PRS_NO ?? row?.EMP_INTL ?? "").trim();
        return photoCodes.has(employeeCode)
          ? { ...row, imageUrl: `/api/employees/photos/${encodeURIComponent(employeeCode)}` }
          : row;
      });
    }
    return ok(payload, { status: response.status });
  } catch (error) {
    return fail(createAppError("network", "Failed to load employees", error?.message), {
      status: 502,
    });
  }
}
