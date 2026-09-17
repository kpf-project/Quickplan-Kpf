import { unstable_cache } from "next/cache";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createAppError, fail, ok } from "@/lib/result";

const getBrandTypes = unstable_cache(async () => {
  const gatewayUrl = process.env.KPF_GATEWAY_URL;
  const apiKey = process.env.KPF_API_KEY;

  if (!gatewayUrl) {
    throw new Error("Gateway URL not configured");
  }

  const response = await fetch(`${gatewayUrl}/api/brand-types`, {
    headers: apiKey ? { "x-api-key": apiKey } : undefined,
  });

  if (!response.ok) {
    throw new Error("Failed to load brand types.");
  }

  return response.json();
}, ["brand-types"], { revalidate: 3600 });

export async function listBrandTypes(request) {
  await requirePermissionKeys(request, ["admin-products"]);
  try {
    const payload = await getBrandTypes();
    return ok(payload, { status: 200 });
  } catch (error) {
    return fail(createAppError("gateway", error?.message ?? "Failed to load brand types."), {
      status: 500,
    });
  }
}
