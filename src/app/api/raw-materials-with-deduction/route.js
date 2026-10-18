import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { redactDataTaskCosts } from "@/lib/dataTaskPermissions";
import { ok, fail, toJsonResponse } from "@/lib/result";
import { fetchGatewayJson } from "@/lib/gatewayClient";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const permission = await requireTaskPermission(request, "raw-materials-deduction-view");

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "summary";
    const skus = searchParams.get("skus");

    let gatewayEndpoint;
    if (skus) {
      gatewayEndpoint = "/api/raw-materials-summary-by-skus";
    } else {
      gatewayEndpoint = view === "lot" ? "/api/raw-materials" : "/api/raw-materials-summary";
    }

    const result = await fetchGatewayJson(
      gatewayEndpoint,
      searchParams,
      "production"
    );

    if (!result.ok) {
      return toJsonResponse(result);
    }

    return toJsonResponse(ok(redactDataTaskCosts(result.data, permission, "raw-materials-deduction-cost-view", process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true")));
  } catch (error) {
    console.error("Error in raw-materials-with-deduction:", error);
    return toJsonResponse(fail(error));
  }
}
