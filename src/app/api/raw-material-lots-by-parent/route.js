import { NextResponse } from "next/server";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { toJsonResponse } from "@/lib/result";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "raw-materials-summary",
      "production-line-planning-view",
      "production-line-planning-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const result = await fetchGatewayJson(
      "/api/raw-material-lots-by-parent",
      searchParams,
      "production"
    );

    return toJsonResponse(result);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to load raw material lots" },
      { status: 500 }
    );
  }
}

