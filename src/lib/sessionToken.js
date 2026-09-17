import "server-only";

import crypto from "crypto";

export const SESSION_COOKIE_NAME = "kpf-session";
export const SESSION_TTL_SECONDS = 4 * 60 * 60;
export const REMEMBER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS = 12 * 60 * 60;
const WRAPPER_USER_AGENT_PATTERN = /kpf-sunmi-wrapper/i;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS = parsePositiveInt(
  process.env.WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS,
  DEFAULT_WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS
);

const HEADER = { alg: "HS256", typ: "JWT" };

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeBuffer(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(data, secret) {
  return base64UrlEncodeBuffer(
    crypto.createHmac("sha256", secret).update(data).digest()
  );
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

export function createSessionToken(payload, ttlSeconds = SESSION_TTL_SECONDS) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is missing");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token) {
    return null;
  }
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(data, secret);
  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp && now >= payload.exp) {
    return null;
  }

  return payload;
}

export function getSessionFromRequest(request, userId) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }
  if (userId && payload.userId !== userId) {
    return null;
  }
  return payload;
}

export function isWrapperRequest(request) {
  const userAgent = request?.headers?.get?.("user-agent") || "";
  return WRAPPER_USER_AGENT_PATTERN.test(userAgent);
}

export function resolveSessionTtlSeconds(request, rememberDevice = false) {
  if (rememberDevice) {
    return REMEMBER_SESSION_TTL_SECONDS;
  }
  if (isWrapperRequest(request)) {
    return WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS;
  }
  return SESSION_TTL_SECONDS;
}

export function resolveSessionCookieMaxAge(request, rememberDevice = false) {
  if (rememberDevice) {
    return REMEMBER_SESSION_TTL_SECONDS;
  }
  if (isWrapperRequest(request)) {
    return WRAPPER_NON_REMEMBER_SESSION_TTL_SECONDS;
  }
  return undefined;
}
