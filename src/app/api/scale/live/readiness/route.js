import { jsonError } from "@/lib/adminApi";
import { loadCentralInboundReadiness } from "@/lib/scale/central-inbound";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return Response.json({ data: await loadCentralInboundReadiness(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
