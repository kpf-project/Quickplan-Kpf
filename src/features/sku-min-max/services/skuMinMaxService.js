import { unstable_cache } from "next/cache";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { createAppError, fail, ok } from "@/lib/result";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";

const MAX_CACHE_PAGE_SIZE = 1000;

async function fetchSkuMinMax(page, pageSize, iccatSearch, cursor) {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    throw new Error("Gateway URL not configured");
  }

  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("pageSize", pageSize.toString());
  if (iccatSearch.trim()) {
    params.set("iccat", iccatSearch.trim());
  }
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(
    `${gatewayUrl}/api/sku-min-max?${params.toString()}`,
    {
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    }
  );

  if (!response.ok) {
    throw new Error("Failed to load sku min-max.");
  }

  return response.json();
}

const getSkuMinMax = unstable_cache(fetchSkuMinMax, ["sku-min-max"], {
  revalidate: 900,
});

export async function listSkuMinMax(request) {
  await requireTaskPermission(request, "data-sku-min-max-view");
  const { searchParams } = new URL(request.url);
  const { page, pageSize } = parsePaginationParams(searchParams);
  const iccatSearch = normalizeParam(searchParams.get("iccat")) ?? "";
  const cursor = searchParams.get("cursor");
  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), { status: 400 });
  }

  try {
    const payload = pageSize > MAX_CACHE_PAGE_SIZE
      ? await fetchSkuMinMax(page, pageSize, iccatSearch, cursor)
      : await getSkuMinMax(page, pageSize, iccatSearch, cursor);
    return ok(payload, { status: 200 });
  } catch (error) {
    return fail(createAppError("gateway", error?.message ?? "Failed to load sku min-max."), {
      status: 500,
    });
  }
}

export async function listSkuMinMaxBySku(request) {
  await requireTaskPermission(request, "data-sku-min-max-view");
  const { searchParams } = new URL(request.url);
  const skus = normalizeParam(searchParams.get("skus")) ?? "";
  if (!skus.trim()) {
    return ok({ data: [] }, { status: 200 });
  }

  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;
  if (!gatewayUrl) {
    return fail(createAppError("config", "Gateway URL not configured"), { status: 500 });
  }

  const params = new URLSearchParams();
  params.set("skus", skus);
  try {
    const response = await fetch(
      `${gatewayUrl}/api/sku-min-max-by-sku?${params.toString()}`,
      {
        headers: apiKey ? { "x-api-key": apiKey } : undefined,
        cache: "no-store",
      }
    );
    const payload = await response.json();
    return ok(payload, { status: response.status });
  } catch (error) {
    return fail(createAppError("network", "Failed to load sku min-max by sku", error?.message), {
      status: 502,
    });
  }
}
