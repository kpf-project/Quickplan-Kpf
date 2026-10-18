import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeParam } from "@/lib/validation";
import { ok } from "@/lib/result";

export async function listIccatTypes(request) {
  await requireTaskPermission(request, "data-product-categories-view");
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
