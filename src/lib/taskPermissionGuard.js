import "server-only";

import { requirePermissionKeys } from "@/lib/permissionGuard";
import { taskPermissionKeys } from "@/lib/taskPermissions";

export function requireTaskPermission(request, key) {
  return requirePermissionKeys(request, taskPermissionKeys(
    key, process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true",
  ));
}
