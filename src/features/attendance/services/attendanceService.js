import { requireAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";
import { createAppError, fail, ok } from "@/lib/result";

export async function listAttendance(request) {
  await requireAdmin(request);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams, {
    pageSize: 20,
  });
  const badgeNumber = normalizeParam(searchParams.get("badgenumber"));
  const cursor = normalizeParam(searchParams.get("cursor"));

  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (badgeNumber) {
    params.set("badgenumber", badgeNumber);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const result = await fetchGatewayJson("/api/attendance", params);
  if (!result.ok) {
    return result;
  }
  return ok(result.data, { status: result.status });
}
