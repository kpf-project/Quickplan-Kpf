import "server-only";

import { createServerClient } from "@supabase/ssr";

const SESSION_COOKIE_NAME = "kpf-session";
const REMEMBER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const WRAPPER_USER_AGENT_PATTERN = /kpf-sunmi-wrapper/i;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS = parsePositiveInt(
  process.env.WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS,
  DEFAULT_WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS
);

function parseCookies(headerValue) {
  if (!headerValue) return {};
  return headerValue.split(";").reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const [name, ...rest] = trimmed.split("=");
    acc[name] = rest.join("=");
    return acc;
  }, {});
}

function decodeBase64UrlUtf8(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }

  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return "";
}

function getSessionFromRequestWithoutVerification(request) {
  const cookieHeader = request?.headers?.get?.("cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(decodeBase64UrlUtf8(parts[1]));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function isWrapperRequest(request) {
  const userAgent = request?.headers?.get?.("user-agent") || "";
  return WRAPPER_USER_AGENT_PATTERN.test(userAgent);
}

function resolveSessionCookieMaxAge(request, rememberDevice = false) {
  if (rememberDevice) return REMEMBER_SESSION_TTL_SECONDS;
  if (isWrapperRequest(request)) return WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS;
  return undefined;
}

function getSupabaseConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth config is missing");
  }

  return { supabaseUrl, supabaseAnonKey };
}

function resolveCookieMaxAge(request, overrideMaxAge) {
  if (Number.isFinite(overrideMaxAge) && overrideMaxAge > 0) {
    return overrideMaxAge;
  }
  const session = getSessionFromRequestWithoutVerification(request);
  return resolveSessionCookieMaxAge(request, Boolean(session?.rememberDevice));
}

export function createSupabaseServerClient(request, response, options = {}) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  const cookieMaxAge = resolveCookieMaxAge(request, options?.maxAge);
  const isProduction = process.env.NODE_ENV === "production";

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: isProduction,
      maxAge: cookieMaxAge,
    },
  });
}

export function copyCookies(sourceResponse, targetResponse) {
  sourceResponse.cookies.getAll().forEach((cookie) => {
    targetResponse.cookies.set(cookie);
  });
}
