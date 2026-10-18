import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createProductionJamUsageBatch,
  cancelProductionJamUsage,
  loadProductionJamProducts,
  loadProductionJamUsageRows,
} from "@/lib/production-jam-usage";
import { ok, toJsonResponse } from "@/lib/result";

import { loadProductionJamOutputProducts } from "@/lib/production-input-output-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-jam-usage-view");
    const supabaseAdmin = getSupabaseAdmin();
    const usageDate = new URL(request.url).searchParams.get("usageDate");
    const [products, rows, outputResult] = await Promise.all([
      loadProductionJamProducts(supabaseAdmin),
      loadProductionJamUsageRows(supabaseAdmin, { dateFrom: usageDate, dateTo: usageDate, includeVoided: true, limit: 0 }),
      usageDate ? loadProductionJamOutputProducts(supabaseAdmin, usageDate).then((outputProducts) => ({ outputProducts })).catch((error) => ({ outputProducts: [], outputWarning: error.message })) : Promise.resolve({ outputProducts: [] }),
    ]);
    const schema = await supabaseAdmin.from("production_jam_usage_entries").select("request_id,request_fingerprint,target_product_code,target_product_name_snapshot").limit(1);
    if (schema.error && !["42703", "PGRST204", "42P01", "PGRST205"].includes(schema.error.code)) throw new Error(schema.error.message);
    return toJsonResponse(ok({ products, rows, ...outputResult, allocationReady: !schema.error }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  let actorId = null;
  let body = null;
  try {
    const permission = await requireTaskPermission(request, "production-jam-usage-write");
    actorId = permission.userId;
    body = await readJson(request);
    const supabaseAdmin = getSupabaseAdmin();
    if (body?.action === "cancel") {
      const result = await cancelProductionJamUsage({ entryId: body.entryId, actorUserId: actorId }, supabaseAdmin);
      if (!result.alreadyVoided) await logAuditEvent({ actorId, action: "production-jam-usage.cancel", targetTable: "production_jam_usage_entries", targetId: result.entry.id, metadata: { ...result.entry, reason: "ผู้ใช้ยืนยันยกเลิกรายการบันทึกแยมผิด" } });
      return toJsonResponse(ok(result));
    }
    const outputs = await loadProductionJamOutputProducts(supabaseAdmin, String(body.usageDate || ""));
    const result = await createProductionJamUsageBatch({ ...body, actorUserId: actorId }, outputs, supabaseAdmin);
    await logAuditEvent({
      actorId,
      action: "production-jam-usage.create",
      targetTable: "production_jam_usage_entries",
      targetId: result.entries[0]?.id,
      metadata: result,
    });
    return toJsonResponse(ok(result));
  } catch (error) {
    await logAuditEvent({
      actorId,
      action: "production-jam-usage.create-failure",
      metadata: { ...body, error: error?.message || String(error) },
    });
    return jsonError(error);
  }
}
