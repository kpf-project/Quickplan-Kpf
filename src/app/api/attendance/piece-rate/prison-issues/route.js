import { jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  createPieceRatePrisonIssue,
  listPieceRatePrisonIssueLots,
} from "@/features/attendance/services/pieceRatePrisonIssueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
];

export async function GET(request) {
  try {
    await requirePermissionKeys(request, PERMISSION_KEYS);
    return Response.json(await listPieceRatePrisonIssueLots());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const [permission, body] = await Promise.all([
      requirePermissionKeys(request, PERMISSION_KEYS),
      readJson(request),
    ]);
    return Response.json(await createPieceRatePrisonIssue(permission, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
