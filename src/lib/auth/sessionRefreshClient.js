"use client";

export async function refreshAuthSession() {
  if (typeof window === "undefined") {
    return { ok: false, status: 0, error: "unavailable" };
  }

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: "refresh_failed",
      };
    }

    return {
      ok: true,
      status: response.status,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "network_failed",
    };
  }
}
