import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { previewWipReceiptErpExport } from "@/lib/erp-wip-receipt-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCALE_RECEIPT_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
];

export async function POST(request) {
  try {
    await requirePermissionKeys(request, SCALE_RECEIPT_PERMISSION_KEYS);
    const body = await readJson(request);
    const payload = await previewWipReceiptErpExport({
      supabaseAdmin: getSupabaseAdmin(),
      filters: body?.filters || {},
    });

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}
