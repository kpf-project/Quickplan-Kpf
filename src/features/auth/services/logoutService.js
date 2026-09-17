import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/sessionToken";
import { copyCookies, createSupabaseServerClient } from "@/lib/supabaseServer";
import { revokeSessionFromRequest } from "@/lib/userSessions";
import { logAuditEvent } from "@/lib/auditLog";

function getRequestMeta(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "";
  const userAgent = request.headers.get("user-agent") || "";
  return { ip, userAgent };
}

export async function handleLogout(request) {
  const tempResponse = NextResponse.next();
  const supabase = createSupabaseServerClient(request, tempResponse);
  const { data } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (data?.user?.id) {
    await revokeSessionFromRequest(request, data.user.id);
  }

  if (data?.user?.id) {
    const { ip, userAgent } = getRequestMeta(request);
    await logAuditEvent({
      actorId: data.user.id,
      action: "auth.logout",
      targetTable: "profiles",
      targetId: data.user.id,
      metadata: {
        ip,
        user_agent: userAgent,
      },
    });
  }

  const response = NextResponse.json({ ok: true });
  copyCookies(tempResponse, response);
  const isProduction = process.env.NODE_ENV === "production";

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("sb-access-token", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("sb-refresh-token", "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
