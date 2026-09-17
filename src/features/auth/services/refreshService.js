import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionFromRequest,
  resolveSessionCookieMaxAge,
  resolveSessionTtlSeconds,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionToken";
import { getUserPermissions } from "@/lib/permissionsData";
import { copyCookies, createSupabaseServerClient } from "@/lib/supabaseServer";
import { assertSessionActive } from "@/lib/userSessions";

export async function handleRefresh(request) {
  const currentSession = getSessionFromRequest(request);
  const initialRememberDevice = Boolean(currentSession?.rememberDevice);
  const sessionCookieMaxAge = resolveSessionCookieMaxAge(request, initialRememberDevice);
  const tempResponse = NextResponse.next();
  const supabase = createSupabaseServerClient(request, tempResponse, {
    maxAge: sessionCookieMaxAge,
  });
  const { data } = await supabase.auth.getUser();
  if (!data?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = data.user.id;
  let permissionData = null;
  let session = null;
  try {
    session = await assertSessionActive(request, userId);
  } catch (error) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    copyCookies(tempResponse, response);
    return response;
  }
  if (session?.permissions) {
    permissionData = {
      permissions: session.permissions,
      isAdmin: Boolean(session.isAdmin),
    };
  } else {
    permissionData = await getUserPermissions(userId);
  }
  const rememberDevice = Boolean(session?.rememberDevice);
  const ttl = resolveSessionTtlSeconds(request, rememberDevice);
  const cookieMaxAge = resolveSessionCookieMaxAge(request, rememberDevice);
  const sessionToken = createSessionToken(
    {
      userId,
      permissions: permissionData.permissions,
      isAdmin: permissionData.isAdmin,
      sessionId: session?.sessionId,
      rememberDevice,
    },
    ttl
  );

  const response = NextResponse.json({ ok: true });
  copyCookies(tempResponse, response);
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });

  return response;
}
