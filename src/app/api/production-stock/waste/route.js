import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  createStockWaste,
  findWasteSourceItemByBarcode,
} from "@/lib/production-stock-waste";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCTION_STOCK_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
];
const PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS = [
  "production-line-attendance-manage",
];

export async function GET(request) {
  try {
    await requirePermissionKeys(request, PRODUCTION_STOCK_PERMISSION_KEYS);

    const { searchParams } = new URL(request.url);
    const barcode = normalizeParam(searchParams.get("barcode"));

    if (!barcode) {
      return Response.json({ error: "Barcode is required" }, { status: 400 });
    }

    const item = await findWasteSourceItemByBarcode(barcode, getSupabaseAdmin());

    return Response.json({
      data: item,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(
      request,
      PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS
    );
    const body = await readJson(request);

    const result = await createStockWaste(
      {
        sourceBarcode: body?.sourceBarcode,
        wasteWeightKg: body?.wasteWeightKg,
        actorUserId: permission.userId,
        remark: body?.remark,
      },
      getSupabaseAdmin()
    );

    return Response.json({
      data: result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
