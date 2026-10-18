import { jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createPieceRatePrisonIssue,
  listPieceRatePrisonIssueLots,
} from "@/features/attendance/services/pieceRatePrisonIssueService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-piece-rate-prison-issue-view");
    return Response.json(await listPieceRatePrisonIssueLots());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const [permission, body] = await Promise.all([
      requireTaskPermission(request, "production-piece-rate-prison-issue-write"),
      readJson(request),
    ]);
    return Response.json(await createPieceRatePrisonIssue(permission, body), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
