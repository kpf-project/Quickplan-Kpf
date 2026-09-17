"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  SESSION_REFRESH_INTERVAL_MS,
  shouldRefreshSession,
} from "@/lib/sessionRefreshPolicy";

export default function SessionRefresher() {
  const pathname = usePathname();
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = null;

    const refresh = async () => {
      if (!shouldRefreshSession({
        pathname,
        visible: document.visibilityState === "visible",
        online: window.navigator.onLine !== false,
        inFlight: refreshInFlightRef.current,
      })) {
        return;
      }

      refreshInFlightRef.current = true;
      try {
        await fetch("/api/auth/refresh", {
          method: "POST",
          cache: "no-store",
          credentials: "include",
        });
      } catch {
        // A later interval or online event will retry.
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await refresh();
        if (active) schedule();
      }, SESSION_REFRESH_INTERVAL_MS);
    };

    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    void refresh();
    schedule();
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
    };
  }, [pathname]);

  return null;
}
