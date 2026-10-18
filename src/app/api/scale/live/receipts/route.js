import { jsonError } from "@/lib/adminApi";
import { requireWeightScaleLivePermission } from "@/lib/scale/live-access";
import { receiveCentralScaleReceipt, recoverCentralScaleReceipt } from "@/lib/scale/central-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No legacy fallback: the independent live transaction store is not configured.
async function unavailable(request, manage = false) {
  try {
    await requireWeightScaleLivePermission(request, { manage });
    return Response.json({
      error: "หน้ากลางแยกจากระบบชั่งเดิมแล้ว ยังไม่เปิดทำรายการจนกว่าระบบข้อมูลอิสระจะพร้อม",
      code: "LIVE_WORKFLOW_NOT_CONFIGURED",
    }, { status: 503 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request) {
  if (process.env.CENTRAL_SCALE_RECEIVING_ENABLED === "true") {
    try {
      return Response.json({ data: await recoverCentralScaleReceipt(request) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return jsonError(error); }
  }
  return unavailable(request);
}

export async function POST(request) {
  if (process.env.CENTRAL_SCALE_RECEIVING_ENABLED === "true") {
    try {
      return Response.json({ data: await receiveCentralScaleReceipt(request) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return jsonError(error); }
  }
  return unavailable(request, true);
}
