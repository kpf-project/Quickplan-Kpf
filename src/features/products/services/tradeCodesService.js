import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeCsvParam, normalizeParam, parsePaginationParams } from "@/lib/validation";
import { createAppError, fail, ok } from "@/lib/result";

export async function listTradeCodes(request) {
  await requirePermissionKeys(request, ["admin-products"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const search = normalizeParam(searchParams.get("search"));
  const brandCodes = normalizeCsvParam(searchParams.get("brandCodes"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (search) {
    params.set("search", search);
  }
  if (brandCodes) {
    params.set("brandCodes", brandCodes);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/trade-codes", params);
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}
