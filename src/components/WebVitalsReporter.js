"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

const ENDPOINT = "/api/performance/web-vitals";

function getConnectionType() {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  return navigator?.connection?.effectiveType || "unknown";
}

export default function WebVitalsReporter() {
  const pathname = usePathname();

  useReportWebVitals((metric) => {
    const payload = {
      ...metric,
      path: pathname || "/",
      effectiveType: getConnectionType(),
      recordedAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    }).catch(() => {
      // Ignore errors from telemetry reporting.
    });
  });

  return null;
}
