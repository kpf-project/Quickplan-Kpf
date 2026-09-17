import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { exportWipReceiptErpExcel } from "@/lib/erp-wip-receipt-export";

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

function encodeContentDispositionFilename(filename) {
  const safeFilename = String(filename || "erp-wip-receipt.xlsx").replace(/["\r\n]/g, "");
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, SCALE_RECEIPT_PERMISSION_KEYS);
    const body = await readJson(request);
    const payload = await exportWipReceiptErpExcel({
      supabaseAdmin: getSupabaseAdmin(),
      filters: body?.filters || {},
      actorUserId: permission.userId || null,
    });

    return new Response(payload.buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": encodeContentDispositionFilename(payload.fileName),
        "X-Erp-Export-Batch-Id": payload.batchId,
        "X-Erp-Export-Document-Count": String(payload.preview.documentCount),
        "X-Erp-Export-Row-Count": String(payload.preview.rowCount),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
