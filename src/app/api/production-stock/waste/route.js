import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createStockWaste,
  findWasteSourceItemByBarcode,
} from "@/lib/production-stock-waste";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-stock-waste-view");

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
    const permission = await requireTaskPermission(request, "production-stock-waste-write");
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
