import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeParam } from "@/lib/validation";
import { ok } from "@/lib/result";

export async function listIccatTypes(request) {
  await requirePermissionKeys(request, [
    "admin-products",
    "raw-materials-summary",
    "raw-materials-lot",
    "raw-materials-movement",
  ]);
  const { searchParams } = new URL(request.url);
  const group = normalizeParam(searchParams.get("group"));
  const params = new URLSearchParams();
  if (group) {
    params.set("group", group);
  }

  const result = await fetchGatewayJson("/api/iccat-types", params);
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: 200 });
}
