import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { getBomApprovalSettings } from "@/lib/bomApprovalSettings";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-bom-view",
      "production-line-bom-manage",
      "production-line-bom-approve",
    ]);
    const supabaseAdmin = getSupabaseAdmin();
    const settings = await getBomApprovalSettings(supabaseAdmin);
    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
