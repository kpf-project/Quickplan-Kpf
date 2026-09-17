import "server-only";

function normalizeToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export function verifyApprovalToken(token) {
  const normalized = normalizeToken(token);
  return normalized || null;
}
