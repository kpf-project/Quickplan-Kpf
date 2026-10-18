import { jsonError } from "@/lib/adminApi";
import { requireWeightScaleLivePermission } from "@/lib/scale/live-access";

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
  return unavailable(request);
}

export async function POST(request) {
  return unavailable(request, true);
}
