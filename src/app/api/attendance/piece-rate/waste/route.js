import { jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { createPieceRateWasteLog } from "@/features/attendance/services/pieceRateWasteService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  try {
    const [permission, body] = await Promise.all([
      requireTaskPermission(request, "production-piece-rate-waste-write"),
      readJson(request),
    ]);
    const result = await createPieceRateWasteLog(permission, body);
    return Response.json(result, { status: result.duplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}

