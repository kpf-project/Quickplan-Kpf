import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  findIssuedItemByBarcode,
  createStockReturn,
  loadReturnableIssuedItems,
} from "@/lib/production-stock-returns";
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

function normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeProductCodes(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(",")
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, PRODUCTION_STOCK_PERMISSION_KEYS);

    const { searchParams } = new URL(request.url);
    const barcode = normalizeParam(searchParams.get("barcode"));

    if (barcode) {
      const item = await findIssuedItemByBarcode(barcode, getSupabaseAdmin());
      return Response.json({
        data: item,
      });
    }

    const payload = await loadReturnableIssuedItems(getSupabaseAdmin(), {
      dateFrom: normalizeParam(searchParams.get("dateFrom")),
      dateTo: normalizeParam(searchParams.get("dateTo")),
      search: normalizeParam(searchParams.get("search")),
      productCodes: normalizeProductCodes(searchParams.get("productCodes")),
      page: normalizePositiveInteger(searchParams.get("page"), 1),
      limit: normalizePositiveInteger(searchParams.get("limit"), 50, 100),
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
    const permission = await requirePermissionKeys(
      request,
      PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS
    );
    const body = await readJson(request);

    const result = await createStockReturn(
      {
        sourceBarcode: body?.sourceBarcode,
        grossWeightKg: body?.grossWeightKg,
        tareWeightKg: body?.tareWeightKg,
        tareSource: body?.tareSource,
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
