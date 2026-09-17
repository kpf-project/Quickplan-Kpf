import { NextResponse } from "next/server";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { toJsonResponse, ok } from "@/lib/result";
import { applyStockDeduction } from "@/lib/stockDeduction";

export const dynamic = "force-dynamic";

/**
 * Transparent proxy for /api/raw-materials-summary-by-skus
 * Used by production planning to fetch stock for specific SKUs
 * Automatically applies FIFO stock deduction
 */
export async function GET(request) {
    try {
        await requirePermissionKeys(request, ["raw-materials-summary"]);

        const { searchParams } = new URL(request.url);

        // Forward to actual Gateway API
        const result = await fetchGatewayJson(
            "/api/raw-materials-summary-by-skus",
            searchParams,
            "production"
        );

        if (!result.ok) {
            return toJsonResponse(result);
        }

        // Apply stock deduction
        const deductedData = await applyStockDeduction(
            result.data,
            "summary",
            request
        );

        return toJsonResponse(ok(deductedData));
    } catch (error) {
        console.error("Error in raw-materials-summary-by-skus proxy:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
