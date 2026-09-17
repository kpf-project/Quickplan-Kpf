import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createAppError, fail, ok } from "@/lib/result";

export async function listHrDepartments(request) {
  await requirePermissionKeys(request, ["admin-consolidated", "admin-employees"]);
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    return fail(createAppError("config", "Gateway URL not configured"), { status: 500 });
  }

  try {
    const response = await fetch(`${gatewayUrl}/api/hr-departments`, {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return fail(createAppError("gateway", payload?.error || "Failed to load departments", payload?.details), {
        status: response.status,
      });
    }

    return ok({ departments: payload.departments ?? [] }, { status: 200 });
  } catch (error) {
    return fail(createAppError("network", "Failed to load departments", error?.message), {
      status: 502,
    });
  }
}
