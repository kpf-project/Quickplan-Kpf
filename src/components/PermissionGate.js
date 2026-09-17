"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/lib/usePermissions";

export default function PermissionGate({
  permissionsAny = [],
  requireAdmin = false,
  children,
}) {
  const router = useRouter();
  const permissionState = usePermissions();
  const isAllowed = permissionState.loaded
    ? requireAdmin
      ? permissionState.isAdmin
      : permissionState.isAdmin ||
        permissionsAny.length === 0 ||
        permissionsAny.some((perm) => permissionState.permissions.includes(perm))
    : false;

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (!isAllowed) {
      router.replace("/unauthorized");
    }
  }, [isAllowed, permissionState.loaded, router]);

  if (!permissionState.loaded || !isAllowed) {
    return null;
  }

  return children;
}
