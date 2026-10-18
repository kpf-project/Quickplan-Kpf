"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import styles from "./GlobalNavigationGuard.module.css";
import { isTabUnsaved, setTabUnsaved } from "@/lib/tabState";

export default function GlobalNavigationGuard() {
  const pathname = usePathname();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState(null);
  const dialogRef = useRef(null);
  const stayRef = useRef(null);

  const handleDiscardAndLeave = useCallback(() => {
    if (pathname) {
      setTabUnsaved(pathname, false);
    }
    setIsOpen(false);
    if (pendingUrl) {
      router.push(pendingUrl);
      setPendingUrl(null);
    }
  }, [pathname, pendingUrl, router]);

  const handleCancelStay = useCallback(() => {
    setIsOpen(false);
    setPendingUrl(null);
  }, []);

  useEffect(() => {
    const handleCaptureClick = (event) => {
      // Find the closest anchor tag
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("blob:")) {
        return;
      }

      // If opening in a new tab or download, skip
      if (anchor.target === "_blank" || anchor.hasAttribute("download") || event.metaKey || event.ctrlKey) {
        return;
      }

      // Check if current tab is dirty / unsaved
      if (!isTabUnsaved(pathname)) {
        return;
      }

      // Check if destination is different from current pathname
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return; // Same page
        }

        // Intercept navigation
        event.preventDefault();
        event.stopPropagation();

        setPendingUrl(url.pathname + url.search);
        setIsOpen(true);
      } catch {
        // Ignore invalid URLs
      }
    };

    // Attach click interceptor in capture phase
    window.addEventListener("click", handleCaptureClick, true);

    // Also handle browser popstate (Back/Forward)
    const handlePopState = (event) => {
      if (isTabUnsaved(pathname)) {
        // Push state back to prevent leaving
        window.history.pushState(null, "", window.location.href);
        setIsOpen(true);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("click", handleCaptureClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    stayRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleCancelStay();
      }
      if (event.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll("button");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [isOpen, handleCancelStay]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-guard-title"
      aria-describedby="unsaved-guard-description"
      className={styles.overlay}
    >
      <div ref={dialogRef} className={styles.dialog}>

        <div>
          <div>
            <div className={styles.heading}>
              <div className={styles.icon}>
                <AlertTriangle size={38} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div>
                <h3
                  id="unsaved-guard-title"
                  className={styles.title}
                >
                  มีข้อมูลที่ยังไม่ได้บันทึก
                </h3>
              </div>
            </div>
          </div>

          <p id="unsaved-guard-description" className={styles.description}>
            คุณมีการเปลี่ยนแปลงข้อมูลในหน้านี้<br />
            หากออกจากหน้า ข้อมูลที่ยังไม่ได้บันทึกจะสูญหาย
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleDiscardAndLeave}
              className={styles.discard}
            >
              ออกโดยไม่บันทึก
            </button>
            <button
              type="button"
              ref={stayRef}
              onClick={handleCancelStay}
              className={styles.stay}
            >
              อยู่หน้านี้ต่อ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
