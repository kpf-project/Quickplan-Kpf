/**
 * Security Guardrail & Zero-Leakage Data Sanitizer.
 * Enforces enterprise-grade data protection, PII masking, and anti-leakage rules
 * before AI responses are delivered to users.
 */

// Thai Citizen National ID pattern (13 digits, with or without spaces/dashes)
const THAI_NATIONAL_ID_REGEX = /\b([0-9]{1})[- ]?([0-9]{4})[- ]?([0-9]{5})[- ]?([0-9]{2})[- ]?([0-9]{1})\b/g;

// Secret Tokens & Connection Strings
const SECRET_CONNECTION_STRING_REGEX = /\b(?:postgres|postgresql|mssql|mongodb|mysql):\/\/[^\s"'<>]+/gi;
const API_KEY_REGEX = /\b(?:AIzaSy[A-Za-z0-9_-]{33}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36})\b/g;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const PASSWORD_KV_REGEX = /(?:password|passwd|pwd|db_pass|secret_key)\s*[:=]\s*["']?([^\s"',;]+)["']?/gi;

/**
 * Determine if user has HR or elevated administrative rights to view sensitive employee PII
 */
function canViewEmployeePii(userContext) {
  if (!userContext) return false;
  if (userContext.isAdmin) return true;

  const roles = new Set((userContext.roles || []).map((r) => String(r).toLowerCase()));
  const perms = new Set(userContext.permissions || []);

  return roles.has("hr") || roles.has("admin") || perms.has("admin-employees");
}

/**
 * Sanitize and mask sensitive information from text response based on user context
 */
export function sanitizeAndMaskResponse(text, userContext) {
  if (!text || typeof text !== "string") return text;

  let sanitized = text;

  // 1. Always mask credentials, API keys, database connection strings, and JWT tokens
  sanitized = sanitized.replace(SECRET_CONNECTION_STRING_REGEX, "[REDACTED_DATABASE_URI]");
  sanitized = sanitized.replace(API_KEY_REGEX, "[REDACTED_API_KEY]");
  sanitized = sanitized.replace(JWT_TOKEN_REGEX, "[REDACTED_SESSION_TOKEN]");
  sanitized = sanitized.replace(PASSWORD_KV_REGEX, "$1: [REDACTED_PASSWORD]");

  // 2. Mask Thai National Citizen IDs for users without HR/Admin clearance
  if (!canViewEmployeePii(userContext)) {
    sanitized = sanitized.replace(THAI_NATIONAL_ID_REGEX, (_match, p1, p2, p3, p4, p5) => {
      // Keep only first digit and mask the rest: 1-XXXX-XXXXX-XX-X
      return `${p1}-XXXX-XXXXX-XX-X`;
    });
  }

  return sanitized;
}
