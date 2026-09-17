"use client";

export const SCALE_WEIGHT_CHANGE_EVENT = "kpf-scale-weight";
export const SCALE_STATUS_CHANGE_EVENT = "kpf-scale-status-change";

const DEFAULT_SCALE_CONFIG = Object.freeze({
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "N",
  handshake: "none",
  previewCommand: "SI",
  stableCommand: "S",
  readTimeoutMs: 900,
  stableReadTimeoutMs: 2500,
  previewIntervalMs: 450,
});

function parseBridgePayload(rawValue) {
  if (rawValue == null) {
    return null;
  }

  if (typeof rawValue === "object") {
    return rawValue;
  }

  const normalized = String(rawValue || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return { ok: normalized === "ok", message: normalized };
  }
}

function getScaleBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AndroidScale || null;
}

function mergeScaleConfig(partialConfig = {}) {
  return {
    ...DEFAULT_SCALE_CONFIG,
    ...(partialConfig || {}),
  };
}

async function invokeBridge(methodName, config) {
  const bridge = getScaleBridge();
  if (!bridge || typeof bridge[methodName] !== "function") {
    return {
      ok: false,
      bridgeAvailable: false,
      state: "bridge_unavailable",
      message: "bridge_unavailable",
    };
  }

  try {
    const payload = config === undefined ? undefined : JSON.stringify(mergeScaleConfig(config));
    const result = payload === undefined ? bridge[methodName]() : bridge[methodName](payload);
    const settled = result && typeof result.then === "function" ? await result : result;
    const parsed = parseBridgePayload(settled) || {};
    return {
      bridgeAvailable: true,
      ...parsed,
    };
  } catch (error) {
    console.warn(`AndroidScale.${methodName} failed`, error);
    return {
      ok: false,
      bridgeAvailable: true,
      state: "bridge_error",
      message: error?.message || "bridge_error",
    };
  }
}

export function hasAndroidScaleBridge() {
  return Boolean(getScaleBridge());
}

export function getLatestScaleStatusSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__KPF_SCALE_STATUS__ || null;
}

export function getLatestScaleWeightSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.__KPF_SCALE_WEIGHT__ || null;
}

export async function connectScale(config) {
  return invokeBridge("connect", config);
}

export async function startScalePreview(config) {
  return invokeBridge("startPreview", config);
}

export async function stopScalePreview() {
  return invokeBridge("stopPreview");
}

export async function disconnectScale() {
  return invokeBridge("disconnect");
}

export async function readStableScaleWeight(config) {
  return invokeBridge("readStableWeight", config);
}

export async function getScaleState() {
  return invokeBridge("getState");
}
