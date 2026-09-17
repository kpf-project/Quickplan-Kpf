import "server-only";

import { ApiError, requireUser } from "@/lib/adminApi";
import { getUserPermissions } from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { assertSessionActive } from "@/lib/userSessions";

export async function requirePermissionKeys(request, permissionKeys = []) {
  const normalizedKeys = permissionKeys.filter(Boolean);
  const { userId, user } = await requireUser(request);
  const session = getSessionFromRequest(request, userId);
  if (session?.userId) {
    await assertSessionActive(request, userId);
    if (!normalizedKeys.length || session.isAdmin) {
      return {
        userId: session.userId,
        user: null,
        isAdmin: Boolean(session.isAdmin),
        permissions: session.permissions ?? [],
      };
    }
    const sessionPermissions = new Set(session.permissions ?? []);
    const hasPermission = normalizedKeys.some((key) =>
      sessionPermissions.has(key)
    );
    if (hasPermission) {
      return {
        userId: session.userId,
        user: null,
        isAdmin: false,
        permissions: Array.from(sessionPermissions),
      };
    }
    throw new ApiError(403, "Forbidden");
  }
  if (!normalizedKeys.length) {
    return { userId, user, isAdmin: false, permissions: [] };
  }

  const { permissions, isAdmin } = await getUserPermissions(userId);
  if (isAdmin) {
    return { userId, user, isAdmin: true, permissions };
  }

  const hasPermission = normalizedKeys.some((key) => permissions.includes(key));
  if (!hasPermission) {
    throw new ApiError(403, "Forbidden");
  }

  return { userId, user, isAdmin: false, permissions };
}
