import {
  buildClientDiagnostic,
  createIncidentId,
} from "./clientDiagnosticsShared.js";
import {
  enqueueClientDiagnostic,
  flushClientDiagnosticQueue,
} from "./clientDiagnosticsQueue.js";

const DEVICE_ID_KEY = "kpf-client-diagnostics-device-id-v1";
const CURRENT_DEPLOYMENT_ID = process.env.NEXT_PUBLIC_DEPLOYMENT_ID || "development";

let initialized = false;
let flushPromise = null;

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getDeviceId(storage) {
  try {
    const existing = storage?.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = globalThis.crypto?.randomUUID?.()
      || `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    storage?.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return "unavailable";
  }
}

function normalizeError(error) {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack || "", digest: error.digest || "" };
  }
  if (typeof error === "string") {
    return { message: error, stack: "", digest: "" };
  }
  try {
    return { message: JSON.stringify(error), stack: "", digest: "" };
  } catch {
    return { message: String(error || "Unknown client error"), stack: "", digest: "" };
  }
}

function getRuntimeMetadata() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const wrapperOnline = typeof window.__KPF_WRAPPER_ONLINE__ === "boolean"
    ? window.__KPF_WRAPPER_ONLINE__
    : null;
  return {
    online: navigator.onLine !== false && wrapperOnline !== false,
    connectivitySource: wrapperOnline === null ? "browser" : "android-wrapper",
    effectiveType: connection?.effectiveType || "",
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    saveData: connection?.saveData,
    visibilityState: document.visibilityState,
    language: navigator.language,
    platform: navigator.platform,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

async function sendDiagnostic(payload) {
  return fetch("/api/client-diagnostics", {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-KPF-Diagnostics": "1",
    },
    body: JSON.stringify(payload),
  });
}

export function flushClientDiagnostics() {
  if (typeof window === "undefined") return Promise.resolve(0);
  if (flushPromise) return flushPromise;
  flushPromise = flushClientDiagnosticQueue(getStorage(), sendDiagnostic)
    .finally(() => {
      flushPromise = null;
    });
  return flushPromise;
}

export function reportClientDiagnostic(error, {
  incidentId = createIncidentId(),
  eventType = "client-error",
  severity = "error",
  metadata = {},
} = {}) {
  if (typeof window === "undefined") return incidentId;
  const storage = getStorage();
  const normalizedError = normalizeError(error);
  const payload = buildClientDiagnostic({
    incidentId,
    eventType,
    severity,
    message: normalizedError.message,
    stack: normalizedError.stack,
    digest: normalizedError.digest,
    pathname: window.location?.href || window.location?.pathname || "/",
    deploymentId: CURRENT_DEPLOYMENT_ID,
    deviceId: getDeviceId(storage),
    occurredAt: new Date().toISOString(),
    metadata: {
      ...getRuntimeMetadata(),
      ...metadata,
    },
  });

  enqueueClientDiagnostic(storage, payload);
  try {
    window.AndroidDiagnostics?.report?.(JSON.stringify(payload));
  } catch {
    // Native diagnostics are optional.
  }
  void flushClientDiagnostics();
  return payload.incidentId;
}

export function initializeClientDiagnostics() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.addEventListener("error", (event) => {
    reportClientDiagnostic(event.error || event.message || "Window error", {
      eventType: "window-error",
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientDiagnostic(event.reason || "Unhandled promise rejection", {
      eventType: "unhandled-rejection",
    });
  });
  window.addEventListener("offline", () => {
    reportClientDiagnostic("Browser reported an offline transition", {
      eventType: "network-offline",
      severity: "warning",
    });
  });
  window.addEventListener("online", () => {
    reportClientDiagnostic("Browser reported an online transition", {
      eventType: "network-online",
      severity: "info",
    });
    void flushClientDiagnostics();
  });

  void flushClientDiagnostics();
}

