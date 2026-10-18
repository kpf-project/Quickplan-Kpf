"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const emptySubscribe = () => () => {};

export default function ProductionLineShell({ children }) {
  const searchParams = useSearchParams();
  const isIframe = useSyncExternalStore(
    emptySubscribe,
    () => typeof window !== "undefined" && window.self !== window.top,
    () => false
  );

  const embedded = searchParams.get("reportCenter") === "1" || isIframe;
  return (
    <div className={embedded ? "production-report-embedded" : "flex min-h-screen"}>
      {!embedded && <Sidebar />}
      <main className={embedded ? "min-w-0" : "flex-1 min-w-0 bg-[#f8f9fa] pb-24 md:pb-0"}>{children}</main>
      {embedded && <style>{`
        @media screen {
          .production-report-embedded .weight-scale-report-page > .mx-auto,
          .production-report-embedded .weight-scale-report-screen-only > .mx-auto { max-width:none; padding:16px; }
          body:has(.production-report-embedded) button[aria-label="ผู้ช่วย AI KPF Quickplan"],
          body:has(.production-report-embedded) aside[aria-label="เมนูผู้ช่วย AI"] { display:none; }
          .app-sidebar-desktop,
          .app-sidebar-mobile-overlay,
          .app-sidebar-mobile-trigger,
          .app-sidebar-mobile-panel,
          .app-sidebar-mobile-bottom-nav { display: none !important; }
        }
      `}</style>}
    </div>
  );
}
