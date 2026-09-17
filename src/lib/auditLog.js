import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";

export async function logAuditEvent({
  actorId,
  action,
  targetTable = null,
  targetId = null,
  metadata = null,
} = {}) {
  if (!actorId || !action) {
    return;
  }
  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action,
      target_table: targetTable,
      target_id: targetId,
      metadata: metadata || {},
    });
  } catch (error) {
    console.warn("Failed to write audit log", error?.message || error);
  }
}
