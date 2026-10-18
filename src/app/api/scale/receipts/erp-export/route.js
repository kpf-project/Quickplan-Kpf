import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { downloadWipReceiptErpBatch, exportWipReceiptErpExcel } from "@/lib/erp-wip-receipt-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function encodeContentDispositionFilename(filename) {
  const safeFilename = String(filename || "erp-wip-receipt.xlsx").replace(/["\r\n]/g, "");
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

function excelResponse(payload) {
  return new Response(payload.buffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": encodeContentDispositionFilename(payload.fileName),
    "Cache-Control": "private, no-store",
    "X-Erp-Export-Batch-Id": payload.batchId,
    "X-Erp-Export-Document-Count": String(payload.preview.documentCount),
    "X-Erp-Export-Row-Count": String(payload.preview.rowCount),
  } });
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-scale-receipt-export");
    return excelResponse(await downloadWipReceiptErpBatch({ batchId: new URL(request.url).searchParams.get("batchId") }));
  } catch (error) { return jsonError(error); }
}

export async function POST(request) {
  try {
    const permission = await requireTaskPermission(request, "production-scale-receipt-export");
    const body = await readJson(request);
    const payload = await exportWipReceiptErpExcel({
      supabaseAdmin: getSupabaseAdmin(),
      filters: body?.filters || {},
      actorUserId: permission.userId || null,
      previewToken: body?.previewToken,
      requestId: body?.requestId,
      documentNumbers: body?.documentNumbers || {},
      overrideReason: body?.overrideReason || "",
      canOverride: permission.isAdmin,
    });

    return excelResponse(payload);
  } catch (error) {
    return jsonError(error);
  }
}
