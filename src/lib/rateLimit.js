import "server-only";

import { ApiError } from "@/lib/adminApi";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const attempts = new Map();

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getKey(request, username) {
  const ip = getClientIp(request);
  const normalized = (username || "anonymous").toLowerCase();
  return `${ip}:${normalized}`;
}

function getEntry(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    const nextEntry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    attempts.set(key, nextEntry);
    return nextEntry;
  }
  return entry;
}

function getRetryAfterSeconds(entry) {
  const remainingMs = Math.max(0, entry.resetAt - Date.now());
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function assertLoginAllowed(request, username) {
  const key = getKey(request, username);
  const entry = getEntry(key);
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    throw new ApiError(429, "Too many login attempts. Try again later.", {
      retryAfterSeconds: getRetryAfterSeconds(entry),
    });
  }
  return key;
}

export function recordLoginFailure(key) {
  const entry = getEntry(key);
  entry.count += 1;
  attempts.set(key, entry);
}

export function clearLoginFailures(key) {
  attempts.delete(key);
}
