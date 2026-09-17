import { ApiError, getSupabaseAdmin, jsonError, readJson, requireAdmin } from "@/lib/adminApi";
import { getBomApprovalSettings, setBomApprovalRequired } from "@/lib/bomApprovalSettings";
import { logAuditEvent } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireAdmin(request);
    const supabaseAdmin = getSupabaseAdmin();
    const settings = await getBomApprovalSettings(supabaseAdmin);
    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const actor = await requireAdmin(request);
    const body = await readJson(request);
    if (typeof body?.requireApproval !== "boolean") {
      throw new ApiError(400, "requireApproval must be boolean");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const settings = await setBomApprovalRequired(
      supabaseAdmin,
      body.requireApproval,
      actor.userId
    );

    await logAuditEvent({
      actorId: actor.userId,
      action: "bom.approval.setting.update",
      targetTable: "system_settings",
      targetId: "production_bom.require_approval",
      metadata: {
        requireApproval: settings.requireApproval,
      },
    });

    return Response.json({ settings });
  } catch (error) {
    return jsonError(error);
  }
}
