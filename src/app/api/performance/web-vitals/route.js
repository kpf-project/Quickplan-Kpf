import { recordWebVital } from "@/lib/performanceMonitor";

export const dynamic = "force-dynamic";

const ALLOWED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"]);

export async function POST(request) {
  try {
    const payload = await request.json();
    const name = String(payload?.name || "").toUpperCase();
    if (!ALLOWED_METRICS.has(name)) {
      return Response.json({ ok: true, ignored: true }, { status: 202 });
    }

    recordWebVital({
      id: payload?.id,
      name,
      value: Number(payload?.value || 0),
      rating: payload?.rating,
      delta: Number(payload?.delta || 0),
      navigationType: payload?.navigationType,
      path: payload?.path,
      effectiveType: payload?.effectiveType,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: "Invalid metrics payload" }, { status: 400 });
  }
}
