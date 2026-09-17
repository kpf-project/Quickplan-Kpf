import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  createScaleLot,
  setScaleCurrentLot,
} from "@/lib/scale/catalog";
import { loadScaleLotsData } from "@/lib/scale/lots";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      data: await loadScaleLotsData(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-settings-manage"]);

    const body = await readJson(request);
    const productConfigId = normalizeParam(body?.productConfigId);
    const lotNo = normalizeParam(body?.lotNo);

    if (!productConfigId || !lotNo) {
      return Response.json(
        { error: "productConfigId and lotNo are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const lot = await createScaleLot(supabaseAdmin, {
      productConfigId,
      lotNo,
      status: "active",
      setAsCurrent: body?.setAsCurrent !== false,
    });

    return Response.json({
      data: {
        lot,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request) {
  try {
    await requirePermissionKeys(request, ["production-line-settings-manage"]);

    const body = await readJson(request);
    const productConfigId = normalizeParam(body?.productConfigId);
    const lotId = normalizeParam(body?.lotId);

    if (!productConfigId || !lotId) {
      return Response.json(
        { error: "productConfigId and lotId are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const config = await setScaleCurrentLot(supabaseAdmin, {
      productConfigId,
      lotId,
    });

    return Response.json({
      data: {
        config,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
