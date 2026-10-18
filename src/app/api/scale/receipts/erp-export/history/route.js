import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { listWipReceiptErpHistory } from "@/lib/erp-wip-receipt-export";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-scale-receipt-export");
    return Response.json({ data: await listWipReceiptErpHistory() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}
