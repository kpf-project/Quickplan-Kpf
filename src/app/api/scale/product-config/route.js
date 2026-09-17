import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  buildScaleLotStatusLabel,
  upsertScaleProductConfig,
} from "@/lib/scale/catalog";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-settings-manage"]);

    const body = await readJson(request);
    const departmentId = normalizeParam(body?.departmentId);
    const skuCode = normalizeParam(body?.skuCode);

    if (!departmentId || !skuCode) {
      return Response.json(
        { error: "departmentId and skuCode are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const config = await upsertScaleProductConfig(supabaseAdmin, {
      departmentId,
      skuCode,
      lotFormat: body?.lotFormat,
      passWeightKg: body?.passWeightKg,
      tareWeightKg: body?.tareWeightKg,
      amountPerPallet: body?.amountPerPallet,
      isActive: body?.status !== "ปิดใช้งาน",
    });

    return Response.json({
      data: {
        config,
        defaultProfile: {
          lotNo: "",
          passWeightKg:
            typeof config.passWeightKg === "number"
              ? String(config.passWeightKg)
              : "",
          tareWeightKg:
            typeof config.tareWeightKg === "number"
              ? String(config.tareWeightKg)
              : "",
          status: buildScaleLotStatusLabel({ isActive: config.isActive }),
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
