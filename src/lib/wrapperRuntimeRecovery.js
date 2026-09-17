import { isSunmiWrapperUserAgent } from "./wrapperPwaCache.js";

export const RUNTIME_VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const DEPLOYMENT_ERROR_PATTERNS = [
  /chunkloaderror/i,
  /loading (?:css )?chunk [^ ]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /__webpack_modules__\[[^\]]+\] is not a function/i,
  /webpack_modules\[[^\]]+\] is not a function/i,
  /module factory is not available/i,
];

function normalizeErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.message) return String(error.message);
  if (error?.reason?.message) return String(error.reason.message);
  return String(error || "");
}

export function isDeploymentRuntimeError(error) {
  const message = normalizeErrorMessage(error);
  return DEPLOYMENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function getRuntimeRecoveryKey(deploymentId) {
  const normalized = String(deploymentId || "").trim() || "unknown";
  return `kpf-wrapper-runtime-recovery:${normalized}`;
}

export function buildRuntimeReloadUrl(rawUrl, deploymentId) {
  const url = new URL(rawUrl);
  url.searchParams.set("__kpf_dpl", String(deploymentId || "unknown"));
  return url.toString();
}

export function shouldCheckRuntimeVersion(userAgent, pathname) {
  return isSunmiWrapperUserAgent(userAgent)
    && String(pathname || "").replace(/\/$/, "")
      === "/production-line/attendance/piece-rate-scan";
}

export async function attemptRuntimeRecovery(globalObject, {
  error,
  deploymentId,
  cleanup,
  force = false,
  reason = "runtime-error",
} = {}) {
  if (!globalObject || !isSunmiWrapperUserAgent(globalObject.navigator?.userAgent)) {
    return false;
  }
  if (!force && !isDeploymentRuntimeError(error)) {
    return false;
  }

  const recoveryKey = getRuntimeRecoveryKey(deploymentId);
  if (globalObject.sessionStorage?.getItem(recoveryKey) === "1") {
    return false;
  }
  globalObject.sessionStorage?.setItem(recoveryKey, "1");

  try {
    globalObject.AndroidDiagnostics?.report?.(JSON.stringify({
      type: "runtime-recovery",
      reason,
      deploymentId: String(deploymentId || "unknown"),
      message: normalizeErrorMessage(error),
      url: globalObject.location?.href || "",
    }));
  } catch {
    // Diagnostics must never block recovery.
  }

  try {
    await cleanup?.(globalObject);
  } catch {
    // A hard reload is still useful when cache cleanup fails.
  }

  globalObject.location.replace(
    buildRuntimeReloadUrl(globalObject.location.href, deploymentId),
  );
  return true;
}
