import { NextResponse } from "next/server";
import { getUserPermissions } from "@/lib/permissionsData";
import {
  createSessionToken,
  getSessionFromRequest,
  resolveSessionCookieMaxAge,
  resolveSessionTtlSeconds,
  SESSION_COOKIE_NAME,
} from "@/lib/sessionToken";
import { copyCookies, createSupabaseServerClient } from "@/lib/supabaseServer";
import { assertSessionActive } from "@/lib/userSessions";

export async function handlePermissions(request) {
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
    const response = NextResponse.json({
      permissions: session.permissions ?? [],
      is_admin: Boolean(session.isAdmin),
    });
    copyCookies(tempResponse, response);
    return response;
  }

  const permissionData = await getUserPermissions(userId);
  const response = NextResponse.json({
    permissions: permissionData.permissions,
    is_admin: permissionData.isAdmin,
  });

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
  const isProduction = process.env.NODE_ENV === "production";
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: cookieMaxAge,
  });
  copyCookies(tempResponse, response);

  return response;
}
