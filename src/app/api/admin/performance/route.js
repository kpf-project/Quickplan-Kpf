import { jsonError, requireAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import {
  getEndpointStats,
  getPerformanceStats,
  getWebVitalsStats,
  resetPerformanceMetrics,
} from "@/lib/performanceMonitor";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get("prefix");
    const includeGateway = searchParams.get("includeGateway") !== "0";

    const stats = getPerformanceStats();
    const endpoints = getEndpointStats(prefix);
    const webVitals = getWebVitalsStats();
    let gateway = null;

    if (includeGateway) {
      const gatewayResult = await fetchGatewayJson("/api/performance", new URLSearchParams(), "static");
      gateway = gatewayResult.ok ? gatewayResult.data : {
        error: gatewayResult?.error?.message || "Gateway metrics unavailable",
      };
    }

    return Response.json({ stats, endpoints, webVitals, gateway });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request);
    resetPerformanceMetrics();

    const gatewayReset = await fetchGatewayJson(
      "/api/performance/reset",
      new URLSearchParams(),
      "static",
      { method: "POST" }
    );
    return Response.json({
      ok: true,
      gatewayReset: gatewayReset.ok,
      gatewayError: gatewayReset.ok ? null : (gatewayReset?.error?.message || "Gateway reset failed"),
    });
  } catch (error) {
    return jsonError(error);
  }
}
