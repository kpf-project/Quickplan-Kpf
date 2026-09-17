import { NextResponse } from "next/server";
import { copyCookies, createSupabaseServerClient } from "@/lib/supabaseServer";

const PUBLIC_PATHS = new Set([
  "/login",
  "/unauthorized",
  "/weight-scale",
  "/production-line/bom/approval/liff",
  "/apk",
  "/manifest.json",
  "/manifest.webmanifest",
  "/sw.js",
  "/push-sw.js",
]);

function normalizePath(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const normalizedPath = normalizePath(pathname);

  if (
    PUBLIC_PATHS.has(normalizedPath) ||
    normalizedPath.startsWith("/apk/") ||
    normalizedPath.startsWith("/brand") ||
    normalizedPath.startsWith("/icons") ||
    normalizedPath.startsWith("/worker-") ||
    normalizedPath.startsWith("/workbox-")
  ) {
    return NextResponse.next();
  }

  try {
    const response = NextResponse.next();
    const supabase = createSupabaseServerClient(request, response);
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", normalizedPath);
      const redirect = NextResponse.redirect(loginUrl);
      copyCookies(response, redirect);
      return redirect;
    }
    return response;
  } catch (error) {
    console.error("Middleware auth check failed", error);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", normalizedPath);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
