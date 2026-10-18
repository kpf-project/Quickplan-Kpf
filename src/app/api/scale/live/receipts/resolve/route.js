import { jsonError } from "@/lib/adminApi";
import { resolveCentralInboundPending } from "@/lib/scale/central-inbound";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request) {
  try { return Response.json({ data: await resolveCentralInboundPending(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error); }
}
