"use client";

export async function adminFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include",
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    const message = payload?.error || "คำขอไม่สำเร็จ";
    const details = payload?.details ? ` (${payload.details})` : "";
    throw new Error(`${message}${details}`);
  }

  return payload;
}
