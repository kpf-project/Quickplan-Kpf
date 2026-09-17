import "server-only";

import crypto from "crypto";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { getSessionFromRequest } from "@/lib/sessionToken";

// In dev/test runs (ex: TestSprite), multiple parallel logins can easily exceed 3 sessions
// and cause sessions to be revoked mid-test. Keep production strict, relax elsewhere.
export const MAX_SESSIONS_PER_USER = process.env.NODE_ENV === "production" ? 3 : 50;

function getClientInfo(request) {
  const userAgent = request.headers.get("user-agent") || "";
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  return { userAgent, ip };
}

export async function createUserSession(request, userId) {
  const sessionId = crypto.randomUUID();
  const { userAgent, ip } = getClientInfo(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { error: insertError } = await supabaseAdmin
    .from("user_sessions")
    .insert({
      user_id: userId,
      session_id: sessionId,
      user_agent: userAgent,
      ip_address: ip,
    });

  if (insertError) {
    throw new ApiError(500, "Failed to create user session", insertError.message);
  }

  await pruneOldSessions(supabaseAdmin, userId);
  return sessionId;
}

async function pruneOldSessions(supabaseAdmin, userId) {
  const { data: sessions, error } = await supabaseAdmin
    .from("user_sessions")
    .select("id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "Failed to load user sessions", error.message);
  }
  if (!sessions || sessions.length <= MAX_SESSIONS_PER_USER) {
    return;
  }

  const revokeCount = sessions.length - MAX_SESSIONS_PER_USER;
  const toRevoke = sessions.slice(0, revokeCount).map((row) => row.id);
  const { error: revokeError } = await supabaseAdmin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .in("id", toRevoke);

  if (revokeError) {
    throw new ApiError(500, "Failed to revoke user sessions", revokeError.message);
  }
}

export async function isSessionActive(userId, sessionId) {
  if (!sessionId || !userId) {
    return false;
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("user_sessions")
    .select("id, revoked_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "Failed to validate session", error.message);
  }
  return Boolean(data && !data.revoked_at);
}

export async function assertSessionActive(request, userId) {
  const session = getSessionFromRequest(request, userId);
  if (!session?.sessionId) {
    throw new ApiError(401, "Session expired");
  }
  const active = await isSessionActive(userId, session.sessionId);
  if (!active) {
    throw new ApiError(401, "Session expired");
  }
  const supabaseAdmin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, is_active, is_archived, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    throw new ApiError(500, "Failed to validate user profile", profileError.message);
  }
  if (!profile || profile.is_active === false || profile.is_archived === true || profile.deleted_at) {
    throw new ApiError(401, "Session expired");
  }
  return session;
}

export async function revokeSessionFromRequest(request, userId) {
  const session = getSessionFromRequest(request, userId);
  if (!session?.sessionId) {
    return;
  }
  const supabaseAdmin = getSupabaseAdmin();
  await supabaseAdmin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("session_id", session.sessionId);
}
