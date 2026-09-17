"use client";

export const WRAPPER_NETWORK_CHANGE_EVENT = "kpf-wrapper-network-change";

function resolveBridgeNetworkState() {
  if (typeof window === "undefined") return null;

  if (typeof window.__KPF_WRAPPER_ONLINE__ === "boolean") {
    return window.__KPF_WRAPPER_ONLINE__;
  }

  const bridge = window.AndroidPrinter;
  if (!bridge || typeof bridge.hasNetworkConnection !== "function") {
    return null;
  }

  try {
    const result = bridge.hasNetworkConnection();
    if (typeof result === "boolean") {
      return result;
    }

    const normalized = String(result || "").trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "true" || normalized === "1" || normalized === "online" || normalized === "ok") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "offline") {
      return false;
    }
  } catch (error) {
    console.warn("Failed to read Android wrapper network state", error);
  }

  return null;
}

export function getConnectivitySnapshot() {
  const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const wrapperOnline = resolveBridgeNetworkState();

  if (typeof wrapperOnline === "boolean") {
    return {
      online: browserOnline && wrapperOnline,
      source: "android-wrapper",
    };
  }

  return {
    online: browserOnline,
    source: "browser",
  };
}

export function isAppOnline() {
  return getConnectivitySnapshot().online;
}
