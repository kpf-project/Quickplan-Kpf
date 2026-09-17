import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import {
  assertWeightScaleLiveReceiptAccess,
  LIVE_SCALE_WEIGHT_SOURCE,
  requireWeightScaleLivePermission,
} from "@/lib/scale/live-access";
import { loadWeightScaleLiveRecentReceiptsData } from "@/lib/scale/live-products";
import { createScaleReceipt } from "@/lib/scale/receipts";
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

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

export async function POST(request) {
  try {
    const permission = await requireWeightScaleLivePermission(request, {
      manage: true,
    });
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
    const authorizedProduct = await assertWeightScaleLiveReceiptAccess(
      supabaseAdmin,
      {
        userId: permission.userId,
        isAdmin: permission.isAdmin,
        departmentId,
        productConfigId,
      }
    );
    const sourceMetadata = normalizeMetadata(body?.metadata);
    const metadata = {
      ...sourceMetadata,
      productCode: authorizedProduct.skuCode,
      productName: authorizedProduct.productName,
      unit: authorizedProduct.unit,
      weightSource: LIVE_SCALE_WEIGHT_SOURCE,
    };

    const receipt = await createScaleReceipt(supabaseAdmin, {
      departmentId: authorizedProduct.departmentId,
      productConfigId: authorizedProduct.productConfigId,
      lotId,
      grossWeightKg: body?.grossWeightKg,
      tareWeightKg: body?.tareWeightKg,
      netWeightKg: body?.netWeightKg,
      passWeightKg: body?.passWeightKg,
      amountPerPallet: body?.amountPerPallet,
      requestId: body?.requestId || crypto.randomUUID(),
      weighedBy: permission.userId,
      metadata,
    });

    const recentReceipts = await loadWeightScaleLiveRecentReceiptsData(
      supabaseAdmin,
      {
      departmentIds: authorizedProduct.departmentIds,
      limit: normalizeLimit(body?.recentLimit, 20),
      }
    );

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
