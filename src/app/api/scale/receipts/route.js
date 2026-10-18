import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createScaleReceipt,
  loadScaleRecentReceiptsData,
} from "@/lib/scale/receipts";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function normalizeLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-scale-receipt-view");

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    const weightSource = normalizeParam(searchParams.get("weightSource"));
    const limit = normalizeLimit(searchParams.get("limit"), 20);

    const supabaseAdmin = getSupabaseAdmin();
    const payload = await loadScaleRecentReceiptsData(supabaseAdmin, {
      departmentId,
      weightSource,
      limit,
    });

    return Response.json({
      data: payload,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requireTaskPermission(request, "production-scale-receipt-write");
    const body = await readJson(request);

    const departmentId = normalizeParam(body?.departmentId);
    const productConfigId = normalizeParam(body?.productConfigId);
    const lotId = normalizeParam(body?.lotId);

    if (!departmentId || !productConfigId || !lotId) {
      return Response.json(
        {
          error: "departmentId, productConfigId and lotId are required",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const receipt = await createScaleReceipt(supabaseAdmin, {
      departmentId,
      productConfigId,
      lotId,
      grossWeightKg: body?.grossWeightKg,
      tareWeightKg: body?.tareWeightKg,
      netWeightKg: body?.netWeightKg,
      passWeightKg: body?.passWeightKg,
      amountPerPallet: body?.amountPerPallet,
      requestId: body?.requestId || crypto.randomUUID(),
      weighedBy: permission.userId,
      metadata: body?.metadata,
    });

    const recentReceipts = await loadScaleRecentReceiptsData(supabaseAdmin, {
      departmentId,
      weightSource: normalizeParam(body?.recentWeightSource),
      limit: normalizeLimit(body?.recentLimit, 20),
    });

    return Response.json({
      data: {
        receipt,
        recentReceipts: recentReceipts.receipts,
        recentSummary: recentReceipts.summary,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
