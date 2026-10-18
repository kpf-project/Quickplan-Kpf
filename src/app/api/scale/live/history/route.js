import { jsonError } from "@/lib/adminApi";
import { loadCentralInboundHistory } from "@/lib/scale/central-inbound";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return Response.json({ data: await loadCentralInboundHistory(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
