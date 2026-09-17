import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createAppError, fail, ok } from "@/lib/result";
import { parsePaginationParams } from "@/lib/validation";

async function fetchDepartmentLookup27(page, pageSize, search = "") {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    throw new Error("Gateway URL not configured");
  }

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (search) {
    params.set("search", search);
  }

  const response = await fetch(
    `${gatewayUrl}/api/department-lookup-27?${params.toString()}`,
    {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.details ||
      payload?.error ||
      "Failed to load department lookup data."
    );
  }

  return response.json();
}
export async function listDepartmentLookup27(request) {
  await requirePermissionKeys(request, ["admin-products", "admin-settings"]);

  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const search = searchParams.get("search")?.trim() ?? "";

  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), {
      status: 400,
    });
  }

  try {
    const payload = await fetchDepartmentLookup27(page, pageSize, search);
    return ok(payload, { status: 200 });
  } catch (error) {
    return fail(
      createAppError(
        "gateway",
        error?.message ?? "Failed to load department lookup data."
      ),
      { status: 500 }
    );
  }
}
