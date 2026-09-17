import { ApiError, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getPublicVapidKey } from "@/lib/pushNotifications";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
    ]);

    const publicKey = getPublicVapidKey();
    if (!publicKey) {
      throw new ApiError(503, "WEB_PUSH_VAPID_PUBLIC_KEY is not configured");
    }

    return Response.json({ ok: true, publicKey });
  } catch (error) {
    return jsonError(error);
  }
}
