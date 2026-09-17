import { jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createPieceRateWasteLog } from "@/features/attendance/services/pieceRateWasteService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTENDANCE_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
];

export async function POST(request) {
  try {
    const [permission, body] = await Promise.all([
      requirePermissionKeys(request, ATTENDANCE_PERMISSION_KEYS),
      readJson(request),
    ]);
    const result = await createPieceRateWasteLog(permission, body);
    return Response.json(result, { status: result.duplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}

