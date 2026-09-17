"use client";

import { useEffect, useState } from "react";

export function usePermissions() {
  const [state, setState] = useState({
    permissions: [],
    isAdmin: false,
    loaded: false,
  });

  useEffect(() => {
    let isActive = true;
    let retryTimer = null;
    let attempt = 0;
    const retryDelaysMs = [150, 400, 800];
    const loadPermissions = async () => {
      try {
        const response = await fetch("/api/auth/permissions", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "โหลดสิทธิ์ไม่สำเร็จ");
        }
        if (!isActive) return;
        setState({
          permissions: payload?.permissions ?? [],
          isAdmin: Boolean(payload?.is_admin),
          loaded: true,
        });
      } catch (error) {
        if (!isActive) return;
        if (attempt < retryDelaysMs.length) {
          const delay = retryDelaysMs[attempt];
          attempt += 1;
          retryTimer = setTimeout(loadPermissions, delay);
          return;
        }
        setState({
          permissions: [],
          isAdmin: false,
          loaded: true,
        });
      }
    };
    loadPermissions();
    return () => {
      isActive = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  return state;
}
