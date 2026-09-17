export const SESSION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const PUBLIC_PATHS = new Set(["/login", "/unauthorized"]);

export function shouldRefreshSession({ pathname, visible, online, inFlight }) {
  const normalizedPath = String(pathname || "").replace(/\/$/, "");
  return !PUBLIC_PATHS.has(normalizedPath)
    && Boolean(visible)
    && Boolean(online)
    && !inFlight;
}
