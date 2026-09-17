import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSessionFromRequest } from "@/lib/sessionToken";

let supabaseAdminClient;

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function jsonError(error) {
  const status = error?.status ?? 500;
  const message = error?.message ?? "Unexpected error";
  const payload = { error: message };
  if (error?.details) {
    payload.details = error.details;
  }
  return Response.json(payload, { status });
}

export function getSupabaseAdmin() {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(500, "Supabase admin env is missing");
  }

  supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdminClient;
}

function parseCookies(headerValue) {
  if (!headerValue) {
    return {};
  }
  return headerValue.split(";").reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) {
      return acc;
    }
    const [name, ...rest] = trimmed.split("=");
    acc[name] = rest.join("=");
    return acc;
  }, {});
}

function normalizeCookieValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  const unquoted = trimmed.startsWith("\"") && trimmed.endsWith("\"")
    ? trimmed.slice(1, -1)
    : trimmed;
  try {
    return decodeURIComponent(unquoted);
  } catch (error) {
    return unquoted;
  }
}

function getCookieEntries(request) {
  if (request?.cookies?.getAll) {
    return request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]);
  }
  const cookieHeader = request?.headers?.get?.("cookie");
  return Object.entries(parseCookies(cookieHeader));
}

function base64UrlToString(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeAuthCookieValue(rawValue) {
  if (typeof rawValue !== "string" || !rawValue) {
    return null;
  }
  if (rawValue.startsWith("base64-")) {
    return base64UrlToString(rawValue.slice("base64-".length));
  }
  return rawValue;
}

function parseAuthCookieJson(rawValue) {
  const decoded = decodeAuthCookieValue(rawValue);
  if (!decoded) {
    return null;
  }
  try {
    return JSON.parse(decoded);
  } catch (error) {
    try {
      return JSON.parse(decodeURIComponent(decoded));
    } catch (innerError) {
      return null;
    }
  }
}

function extractAccessTokenFromCookies(request) {
  const cookies = Object.fromEntries(getCookieEntries(request));
  const authTokenKey = Object.keys(cookies).find((name) =>
    /^sb-.*-auth-token$/.test(name)
  );
  if (authTokenKey) {
    const parsed = parseAuthCookieJson(normalizeCookieValue(cookies[authTokenKey]));
    return parsed?.access_token ?? null;
  }

  const chunkKeys = Object.keys(cookies)
    .filter((name) => /^sb-.*-auth-token\.\d+$/.test(name))
    .sort((a, b) => Number(a.split(".").pop()) - Number(b.split(".").pop()));
  if (chunkKeys.length === 0) {
    return null;
  }

  const rawValue = chunkKeys
    .map((key) => normalizeCookieValue(cookies[key]))
    .join("");
  if (!rawValue) {
    return null;
  }
  const parsed = parseAuthCookieJson(rawValue);
  return parsed?.access_token ?? null;
}

export function getAccessToken(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const headerToken =
    request.headers.get("x-access-token") ??
    request.headers.get("x-supabase-token");
  if (headerToken) {
    return headerToken.trim();
  }
  const tokenFromAuthCookie = extractAccessTokenFromCookies(request);
  if (tokenFromAuthCookie) {
    return tokenFromAuthCookie;
  }

  return null;
}

export async function requireAdmin(request) {
  const { userId, user } = await requireUser(request);

  const supabaseAdmin = getSupabaseAdmin();
  const { data: adminRole, error: adminRoleError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("role_key", "admin")
    .maybeSingle();

  if (adminRoleError || !adminRole) {
    throw new ApiError(500, "Admin role not configured");
  }

  const { data: userRole, error: userRoleError } = await supabaseAdmin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .eq("role_id", adminRole.id)
    .maybeSingle();

  if (userRoleError) {
    throw new ApiError(500, "Failed to verify admin role", userRoleError.message);
  }
  if (!userRole) {
    throw new ApiError(403, "Forbidden");
  }

  return { userId, user };
}

export async function requireUser(request) {
  const token = getAccessToken(request);
  const supabaseAdmin = getSupabaseAdmin();
  const sessionPayload = getSessionFromRequest(request);
  let resolvedUser = null;
  let userError = null;

  if (token) {
    const userResult = await supabaseAdmin.auth.getUser(token);
    resolvedUser = userResult?.data?.user ?? null;
    userError = userResult?.error ?? null;
  }

  if (!resolvedUser && sessionPayload?.userId) {
    const fallbackUserResult = await supabaseAdmin.auth.admin.getUserById(sessionPayload.userId);
    resolvedUser = fallbackUserResult?.data?.user ?? null;
  }

  if (!resolvedUser) {
    if (!token && !sessionPayload?.userId) {
      throw new ApiError(401, "Missing access token");
    }
    throw new ApiError(401, "Invalid access token", userError?.message);
  }

  const session = getSessionFromRequest(request, resolvedUser.id);
  if (!session?.sessionId) {
    throw new ApiError(401, "Session expired");
  }
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("user_sessions")
    .select("id, revoked_at")
    .eq("user_id", resolvedUser.id)
    .eq("session_id", session.sessionId)
    .maybeSingle();
  if (sessionError) {
    throw new ApiError(500, "Failed to validate session", sessionError.message);
  }
  if (!sessionRow || sessionRow.revoked_at) {
    throw new ApiError(401, "Session expired");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, is_active, is_archived, deleted_at")
    .eq("id", resolvedUser.id)
    .maybeSingle();
  if (profileError) {
    throw new ApiError(500, "Failed to validate user profile", profileError.message);
  }
  if (!profile || profile.is_active === false || profile.is_archived === true || profile.deleted_at) {
    throw new ApiError(403, "User account is not active");
  }

  return { userId: resolvedUser.id, user: resolvedUser };
}

export function buildEmailFromUsername(username) {
  const domain = process.env.SUPABASE_AUTH_EMAIL_DOMAIN || "kpfoods.local";
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
  if (!normalized) {
    return null;
  }
  return `${normalized}@${domain}`;
}

export async function readJson(request) {
  try {
    const text = await request.text();
    if (!text || !text.trim()) {
      return {};
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "Invalid JSON body");
  }
}
