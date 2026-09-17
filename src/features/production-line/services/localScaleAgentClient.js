"use client";

const DEFAULT_SCALE_AGENT_URL = "http://127.0.0.1:41952";
const SCALE_AGENT_URL_STORAGE_KEY = "kpf-scale-serial-agent-url-v1";
const SCALE_AGENT_RECONNECT_DELAY_MS = 3000;

function resolveBaseUrl() {
  if (typeof window !== "undefined") {
    const configured = window.localStorage.getItem(SCALE_AGENT_URL_STORAGE_KEY);
    const normalizedConfigured = String(configured || "").trim();
    if (normalizedConfigured) {
      return normalizedConfigured.replace(/\/+$/, "");
    }
  }

  return DEFAULT_SCALE_AGENT_URL;
}

function resolveStreamUrl() {
  return `${resolveBaseUrl().replace(/^http/i, "ws")}/stream`;
}

async function parseAgentResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Local scale agent request failed.");
  }

  return payload?.data ?? payload;
}

export function getDefaultScaleAgentUrl() {
  return DEFAULT_SCALE_AGENT_URL;
}

export async function fetchScaleAgentHealth() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/health`, {
    method: "GET",
    cache: "no-store",
  });

  return parseAgentResponse(response);
}

export async function fetchScaleAgentPorts() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/ports`, {
    method: "GET",
    cache: "no-store",
  });

  return parseAgentResponse(response);
}

export async function fetchScaleAgentSerialConfig() {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/config/serial`, {
    method: "GET",
    cache: "no-store",
  });

  return parseAgentResponse(response);
}

export async function saveScaleAgentSerialConfig(payload) {
  const baseUrl = resolveBaseUrl();
  const response = await fetch(`${baseUrl}/config/serial`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseAgentResponse(response);
}

export function subscribeScaleAgentStream(handlers = {}) {
  let socket = null;
  let reconnectTimer = null;
  let closedByCaller = false;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (closedByCaller || reconnectTimer) {
      return;
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, SCALE_AGENT_RECONNECT_DELAY_MS);
  }

  function connect() {
    if (closedByCaller) {
      return;
    }

    try {
      socket = new WebSocket(resolveStreamUrl());
    } catch (error) {
      handlers.onError?.(error);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      handlers.onOpen?.();
    };

    socket.onmessage = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.type === "reading") {
        handlers.onReading?.(payload);
        return;
      }

      if (payload?.type === "status") {
        handlers.onStatus?.(payload);
      }
    };

    socket.onerror = () => {
      handlers.onError?.(new Error("Scale agent stream connection error."));
    };

    socket.onclose = () => {
      socket = null;
      handlers.onClose?.();
      scheduleReconnect();
    };
  }

  connect();

  return function unsubscribeScaleAgentStream() {
    closedByCaller = true;
    clearReconnectTimer();

    if (socket) {
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Ignore close failures during teardown.
      }
      socket = null;
    }
  };
}
