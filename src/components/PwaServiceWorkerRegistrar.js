"use client";

import { useEffect } from "react";
import {
  cleanupWrapperPwaCaches,
  shouldRegisterPwaServiceWorker,
} from "@/lib/wrapperPwaCache";

const WRAPPER_CLEANUP_RELOAD_KEY = "__kpf_wrapper_pwa_cleanup_reloaded__";

export default function PwaServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (!shouldRegisterPwaServiceWorker(window.navigator.userAgent)) {
      cleanupWrapperPwaCaches(window)
        .then(() => {
          if (window.sessionStorage.getItem(WRAPPER_CLEANUP_RELOAD_KEY)) {
            return;
          }
          window.sessionStorage.setItem(WRAPPER_CLEANUP_RELOAD_KEY, "1");
          window.setTimeout(() => window.location.reload(), 150);
        })
        .catch((error) => {
          console.warn("KPF wrapper PWA cache cleanup failed", error);
        });
      return;
    }

    let cancelled = false;

    const registerServiceWorker = () => {
      if (cancelled) {
        return;
      }
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("PWA service worker registration failed", error);
      });
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", registerServiceWorker);
    };
  }, []);

  return null;
}
