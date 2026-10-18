import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { previewWipReceiptErpExport } from "@/lib/erp-wip-receipt-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  try {
    const permission = await requireTaskPermission(request, "production-scale-receipt-export");
    const body = await readJson(request);
    const payload = await previewWipReceiptErpExport({
      supabaseAdmin: getSupabaseAdmin(),
      filters: body?.filters || {},
      actorUserId: permission.userId,
      canOverride: permission.isAdmin,
    });

    return Response.json({ data: payload }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
