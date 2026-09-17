"use client";

import { useEffect } from "react";
import { hasDeploymentChanged } from "@/lib/deploymentVersion";
import {
  attemptRuntimeRecovery,
  isDeploymentRuntimeError,
  RUNTIME_VERSION_CHECK_INTERVAL_MS,
  shouldCheckRuntimeVersion,
} from "@/lib/wrapperRuntimeRecovery";
import {
  cleanupWrapperPwaCaches,
  isSunmiWrapperUserAgent,
} from "@/lib/wrapperPwaCache";

const CURRENT_DEPLOYMENT_ID = process.env.NEXT_PUBLIC_DEPLOYMENT_ID || "development";

export default function WrapperRuntimeRecovery() {
  useEffect(() => {
    if (!isSunmiWrapperUserAgent(window.navigator?.userAgent)) {
      return undefined;
    }

    let disposed = false;
    let versionTimer = null;

    const recover = (error, options = {}) => attemptRuntimeRecovery(window, {
      error,
      deploymentId: options.deploymentId || CURRENT_DEPLOYMENT_ID,
      force: options.force,
      reason: options.reason,
      cleanup: cleanupWrapperPwaCaches,
    });

    const onError = (event) => {
      const error = event.error || event.message || "unknown error";
      if (isDeploymentRuntimeError(error)) {
        void recover(error, { reason: "window-error" });
      }
    };

    const onUnhandledRejection = (event) => {
      if (isDeploymentRuntimeError(event.reason)) {
        void recover(event.reason, { reason: "unhandled-rejection" });
      }
    };

    const checkRuntimeVersion = async () => {
      if (
        disposed
        || document.visibilityState !== "visible"
        || window.navigator.onLine === false
        || !shouldCheckRuntimeVersion(window.navigator.userAgent, window.location.pathname)
      ) {
        return;
      }

      try {
        const response = await fetch("/api/runtime-version", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok || disposed) return;

        const payload = await response.json().catch(() => null);
        const nextDeploymentId = String(payload?.deploymentId || "").trim();
        if (!hasDeploymentChanged(CURRENT_DEPLOYMENT_ID, nextDeploymentId)) return;

        await recover(new Error("Next.js deployment changed"), {
          deploymentId: nextDeploymentId,
          force: true,
          reason: "deployment-changed",
        });
      } catch {
        // Network recovery is handled by the wrapper and the next scheduled check.
      }
    };

    const scheduleVersionCheck = () => {
      window.clearTimeout(versionTimer);
      versionTimer = window.setTimeout(async () => {
        await checkRuntimeVersion();
        if (!disposed) scheduleVersionCheck();
      }, RUNTIME_VERSION_CHECK_INTERVAL_MS);
    };

    const onPageAvailable = () => {
      if (document.visibilityState === "visible") {
        void checkRuntimeVersion();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("online", onPageAvailable);
    document.addEventListener("visibilitychange", onPageAvailable);

    void checkRuntimeVersion();
    scheduleVersionCheck();

    return () => {
      disposed = true;
      window.clearTimeout(versionTimer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("online", onPageAvailable);
      document.removeEventListener("visibilitychange", onPageAvailable);
    };
  }, []);

  return null;
}
