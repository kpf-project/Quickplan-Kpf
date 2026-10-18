import { NextResponse } from "next/server";
import { ApiError } from "@/lib/adminApi";
import {
  getUserPermissions,
  resolvePermissionKeyByPath,
} from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { copyCookies, createSupabaseServerClient } from "@/lib/supabaseServer";
import { assertSessionActive } from "@/lib/userSessions";

const AUTH_CACHE_MS = 2 * 60 * 1000;
const authorizeCache = new Map();

const aliasPermissions = {
  "/raw-materials": [
    "raw-materials-summary",
    "raw-materials-lot",
    "raw-materials-movement",
  ],
  "/production-line/settings": [
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  "/production-line/settings/type": [
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  "/production-line/settings/department-products": [
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  "/production-line/settings/machine": [
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  "/production-line/settings/wip-policies": [
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  "/production-line/attendance": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
  ],
  "/production-line/attendance/report": [
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-attendance-view",
    "production-line-attendance-manage",
  ],
  "/production-line/attendance/piece-rate-scan": [
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-attendance-view",
    "production-line-attendance-manage",
  ],
  "/production-line/fg-wip": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
  ],
  "/production-line/attendance/report/piece-rate": [
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-attendance-view",
    "production-line-attendance-manage",
  ],
  "/production-line/attendance/report/scan-events": [
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-attendance-view",
    "production-line-attendance-manage",
  ],
  "/production-line/bom": [
    "production-line-bom-view",
    "production-line-bom-manage",
  ],
  "/production-line/planning": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.publish_master",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
    "plan.approve_exception",
  ],
  "/production-line/planning/schedule": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.publish_master",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
  ],
  "/production-line/planning/master": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.publish_master",
  ],
  "/production-line/planning/plan": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
  ],
  "/production-line/planning/inbox": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
  ],
  "/production-line/planning/report": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.approve_exception",
  ],
  "/production-line/planning/expired": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
  ],
  "/production-line/planning/notifications": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.publish_master",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
  ],
  "/production-line/planning/claims": [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.claim_material",
    "plan.release_claim",
    "plan.reassign_claim",
    "plan.view_claim_all",
    "plan.consolidate_cross_qa",
  ],
  "/admin/raw-material-requisitions": ["admin-requisition", "admin-returns"],
  "/raw-material-requisitions": ["admin-requisition", "admin-returns"],
};

function normalizePath(value) {
  if (!value) {
    return "";
  }
  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }
  return value;
}

function readAuthorizeCache(userId, path) {
  const key = `${userId}:${path}`;
  const cached = authorizeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  return null;
}

function writeAuthorizeCache(userId, path, payload, status = 200) {
  const key = `${userId}:${path}`;
  authorizeCache.set(key, {
    payload,
    status,
    expiresAt: Date.now() + AUTH_CACHE_MS,
  });
}

async function authorizeWithPermissions(path, permissionData) {
  if (permissionData.isAdmin) {
    return { ok: true, is_admin: true };
  }

  const aliasKeys = aliasPermissions[path];
  if (aliasKeys?.length) {
    const hasAliasPermission = aliasKeys.some((key) =>
      permissionData.permissions.includes(key)
    );
    if (!hasAliasPermission) {
      throw new ApiError(403, "Forbidden");
    }
    return { ok: true, permission: aliasKeys };
  }

  const permissionKey = await resolvePermissionKeyByPath(path);
  if (!permissionKey) {
    if (path.startsWith("/admin")) {
      throw new ApiError(403, "Forbidden");
    }
    return { ok: true, is_admin: false };
  }

  if (!permissionData.permissions.includes(permissionKey)) {
    throw new ApiError(403, "Forbidden");
  }

  return { ok: true, permission: permissionKey };
}

export async function handleAuthorize(request) {
  const { searchParams } = new URL(request.url);
  const path = normalizePath(searchParams.get("path"));
  if (!path) {
    throw new ApiError(400, "Path is required");
  }

  const tempResponse = NextResponse.next();
  const supabase = createSupabaseServerClient(request, tempResponse);
  const { data } = await supabase.auth.getUser();
  if (!data?.user?.id) {
    throw new ApiError(401, "Unauthorized");
  }

  const userId = data.user.id;
  let session = null;
  try {
    session = await assertSessionActive(request, userId);
  } catch (error) {
    throw new ApiError(401, "Unauthorized");
  }
  if (session?.userId) {
    const cached = readAuthorizeCache(userId, path);
    if (cached) {
      const response = NextResponse.json(cached.payload, {
        status: cached.status,
      });
      copyCookies(tempResponse, response);
      return response;
    }
    const payload = await authorizeWithPermissions(path, {
      permissions: session.permissions ?? [],
      isAdmin: Boolean(session.isAdmin),
    });
    writeAuthorizeCache(userId, path, payload, 200);
    const response = NextResponse.json(payload);
    copyCookies(tempResponse, response);
    return response;
  }

  const cached = readAuthorizeCache(userId, path);
  if (cached) {
    const response = NextResponse.json(cached.payload, {
      status: cached.status,
    });
    copyCookies(tempResponse, response);
    return response;
  }

  const permissionData = await getUserPermissions(userId);
  const payload = await authorizeWithPermissions(path, permissionData);
  writeAuthorizeCache(userId, path, payload, 200);
  const response = NextResponse.json(payload);
  copyCookies(tempResponse, response);
  return response;
}

export function handleAuthorizeError(error, request) {
  if (error?.status === 403 || error?.status === 401) {
    const { searchParams } = new URL(request.url);
    const path = normalizePath(searchParams.get("path"));
    const session = getSessionFromRequest(request);
    const userId = session?.userId ?? null;
    if (userId && path) {
      writeAuthorizeCache(userId, path, { error: "Forbidden" }, error.status);
    }
  }
}
