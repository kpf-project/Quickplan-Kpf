"use client";

const BASE_URL = "http://127.0.0.1:41953";
const RECONNECT_DELAY_MS = 3000;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Piece-rate scale agent request failed.");
  return payload?.data ?? payload;
}

export function fetchPieceRateScaleHealth() { return request("/health"); }
export function fetchPieceRateScalePorts() { return request("/ports"); }
export function fetchPieceRateScaleSerialConfig() { return request("/config/serial"); }
export function savePieceRateScaleSerialConfig(payload) {
  return request("/config/serial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function subscribePieceRateScaleStream(handlers = {}) {
  let socket = null;
  let reconnectTimer = null;
  let closed = false;
  const connect = () => {
    if (closed) return;
    try { socket = new WebSocket("ws://127.0.0.1:41953/stream"); }
    catch (error) { handlers.onError?.(error); reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS); return; }
    
    let hasOpened = false;
    socket.onopen = () => {
      hasOpened = true;
      handlers.onOpen?.();
    };
    socket.onmessage = (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload?.type === "reading") handlers.onReading?.(payload);
      if (payload?.type === "status") handlers.onStatus?.(payload);
    };
    socket.onerror = () => {
      // Only report error if connection was already established.
      // Connection failure before opening is handled silently by the reconnect loop.
      if (hasOpened) {
        handlers.onError?.(new Error("Piece-rate scale stream error."));
      }
    };
    socket.onclose = () => {
      socket = null;
      handlers.onClose?.();
      if (!closed) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  };
  connect();
  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) { socket.onclose = null; socket.close(); socket = null; }
  };
}
