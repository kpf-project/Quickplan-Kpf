import { unstable_cache } from "next/cache";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createAppError, fail, ok } from "@/lib/result";
import { parsePaginationParams } from "@/lib/validation";

const MAX_CACHE_PAGE_SIZE = 1000;

async function fetchSuppliers(page, pageSize, cursor, search = "") {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    throw new Error("Gateway URL not configured");
  }

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (search) {
    params.set("search", search);
  }

  const response = await fetch(
    `${gatewayUrl}/api/suppliers?${params.toString()}`,
    {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load suppliers.");
  }

  return response.json();
}

const getSuppliers = unstable_cache(fetchSuppliers, ["suppliers"], {
  revalidate: 900,
});

export async function listSuppliers(request) {
  await requirePermissionKeys(request, [
    "admin-suppliers",
    "raw-materials-summary",
  ]);
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const cursor = searchParams.get("cursor");
  const search = searchParams.get("search")?.trim() ?? "";
  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }
  try {
    const payload = pageSize > MAX_CACHE_PAGE_SIZE
      ? await fetchSuppliers(page, pageSize, cursor, search)
      : await getSuppliers(page, pageSize, cursor, search);
    return ok(payload, { status: 200 });
  } catch (error) {
    return fail(createAppError("gateway", error?.message ?? "Failed to load suppliers."), {
      status: 500,
    });
  }
}
