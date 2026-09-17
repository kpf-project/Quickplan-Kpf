"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const RETRY_DELAYS_MS = [350, 900];

function buildLoginUrl(nextPath) {
  const loginUrl = new URL("/login", window.location.origin);
  if (nextPath && nextPath !== "/") {
    loginUrl.searchParams.set("next", nextPath);
  }
  return loginUrl.toString();
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function ProtectedRouteClientGuard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() || "";
  const nextPath = `${pathname}${search ? `?${search}` : ""}`;

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      let lastStatus = null;

      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          const response = await fetch("/api/auth/refresh", {
            method: "POST",
            cache: "no-store",
            credentials: "include",
          });

          if (response.ok) {
            return;
          }

          lastStatus = response.status;
          if (response.status === 401) {
            break;
          }
        } catch {
          lastStatus = null;
        }

        if (attempt < RETRY_DELAYS_MS.length) {
          await wait(RETRY_DELAYS_MS[attempt]);
          if (cancelled) {
            return;
          }
        }
      }

      if (cancelled) {
        return;
      }

      if (lastStatus === 401) {
        window.location.replace(buildLoginUrl(nextPath));
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  return null;
}
