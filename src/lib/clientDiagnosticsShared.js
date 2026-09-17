const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 12_000;
const MAX_TEXT_LENGTH = 1_000;

const ALLOWED_METADATA_KEYS = new Set([
  "online",
  "connectivitySource",
  "effectiveType",
  "downlink",
  "rtt",
  "saveData",
  "visibilityState",
  "language",
  "platform",
  "viewportWidth",
  "viewportHeight",
  "deviceMemory",
  "hardwareConcurrency",
  "firstDeliveryFailure",
]);

function limitText(value, maxLength = MAX_TEXT_LENGTH) {
  return String(value ?? "").slice(0, maxLength);
}

export function sanitizeDiagnosticText(value, maxLength = MAX_STACK_LENGTH) {
  return limitText(value, maxLength)
    .replace(/([?&])[^\s)\]}]+/g, "$1[REDACTED_QUERY]")
    .replace(/\b(authorization)\s*:\s*(?:bearer\s+)?[^\s,;]+/gi, "$1: [REDACTED]")
    .replace(/\b(cookie|set-cookie)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]");
}

function sanitizePathname(value) {
  const raw = String(value || "/");
  try {
    const parsed = new URL(raw, "https://diagnostics.invalid");
    return limitText(parsed.pathname || "/", 500);
  } catch {
    return limitText(raw.split(/[?#]/, 1)[0] || "/", 500);
  }
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => ALLOWED_METADATA_KEYS.has(key))
      .map(([key, value]) => {
        if (key === "firstDeliveryFailure") {
          return [key, {
            at: limitText(value?.at, 40),
            reason: limitText(value?.reason, 80),
            status: Number.isFinite(Number(value?.status)) ? Number(value.status) : undefined,
          }];
        }
        if (typeof value === "boolean" || typeof value === "number") {
          return [key, value];
        }
        return [key, limitText(value, 200)];
      }),
  );
}

export function createIncidentId({
  now = new Date(),
  randomValue,
} = {}) {
  const timestamp = new Date(now).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = String(
    randomValue
      || globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 6)
      || Math.random().toString(36).slice(2, 8),
  ).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "0");
  return `WEB-${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}-${random}`;
}

export function buildClientDiagnostic({
  incidentId,
  eventType,
  severity = "error",
  message,
  stack,
  digest,
  pathname,
  deploymentId,
  deviceId,
  occurredAt,
  metadata,
} = {}) {
  return {
    incidentId: limitText(incidentId || createIncidentId(), 80),
    eventType: limitText(eventType || "client-error", 80),
    severity: ["info", "warning", "error", "fatal"].includes(severity) ? severity : "error",
    message: sanitizeDiagnosticText(message || "Unknown client error", MAX_MESSAGE_LENGTH),
    stack: sanitizeDiagnosticText(stack || "", MAX_STACK_LENGTH),
    digest: limitText(digest, 200),
    pathname: sanitizePathname(pathname),
    deploymentId: limitText(deploymentId, 200),
    deviceId: limitText(deviceId, 100),
    occurredAt: limitText(occurredAt || new Date().toISOString(), 40),
    metadata: sanitizeMetadata(metadata),
  };
}

