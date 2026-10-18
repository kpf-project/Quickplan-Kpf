import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { getBomApprovalSettings } from "@/lib/bomApprovalSettings";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-bom-view");
    const supabaseAdmin = getSupabaseAdmin();
    const settings = await getBomApprovalSettings(supabaseAdmin);
    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
