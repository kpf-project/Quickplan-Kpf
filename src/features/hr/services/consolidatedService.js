import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";
import { createAppError, fail, ok } from "@/lib/result";

function getDefaultDate() {
  return new Date().toISOString().split("T")[0];
}

export async function listConsolidated(request) {
  await requirePermissionKeys(request, ["admin-consolidated"]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams, { pageSize: 20 });
  const startDate = normalizeParam(searchParams.get("startDate")) ?? getDefaultDate();
  const endDate = normalizeParam(searchParams.get("endDate")) ?? getDefaultDate();
  const searchTerm = normalizeParam(searchParams.get("search")) ?? "";
  const department = normalizeParam(searchParams.get("department")) ?? "";
  const branch = normalizeParam(searchParams.get("branch")) ?? "";
  const cursor = normalizeParam(searchParams.get("cursor"));

  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }

  const params = new URLSearchParams({
    startDate,
    endDate,
    search: searchTerm,
    department,
    branch,
    page: page.toString(),
    pageSize: pageSize.toString(),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/consolidated", params);
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}
