"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { preload } from "swr";
import { fetcher } from "@/lib/clientFetch";
import {
  Bell,
  ClipboardList,
  Factory,
  FileText,
  Table2,
} from "lucide-react";

const PLANNING_TABS = [
  { key: "master", href: "/production-line/planning/schedule", label: "แผนหลัก", icon: ClipboardList },
  { key: "plan", href: "/production-line/planning/plan", label: "งานแผนก", icon: Factory },
  { key: "report", href: "/production-line/planning/report", label: "รายงาน & ปรับแผน", icon: Table2 },
  { key: "requisition-preview", href: "/production-line/planning/requisition-preview", label: "Preview ใบเบิก", icon: FileText },
  { key: "notifications", href: "/production-line/planning/notifications", label: "แจ้งเตือน", icon: Bell },
];

export default function PlanningHeader({
  activeTab = "master",
  meta,
  children,
}) {
  const searchParams = useSearchParams();
  const source = searchParams?.get("source") || searchParams?.get("dataSource") || "";
  const isLegacy = source.toLowerCase() === "legacy";

  // Preload shared planning master data during browser idle time for zero-delay tab switching
  useEffect(() => {
    const warmPlanningData = () => {
      try {
        preload("/api/production-planning/departments?scope=assigned", fetcher);
        preload("/api/production-planning/master-plan-options", fetcher);
      } catch {
        // Safe warmup ignores any error
      }
    };

    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const id = window.requestIdleCallback(warmPlanningData, { timeout: 1500 });
        return () => window.cancelIdleCallback(id);
      } else {
        const timer = setTimeout(warmPlanningData, 100);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  if (searchParams?.get("reportCenter") === "1") {
    return null;
  }

  return (
    <header className="w-full border-b border-slate-200 bg-white text-slate-900 shadow-sm print:hidden">
      {/* 
        Single, Stable, Fixed Sub-Header Bar (h-11 = 44px)
        Left: Always fixed title "วางแผนการผลิต | PLANNING MODULE"
        Right: Always anchored 5 tabs in the exact same place across ALL pages
      */}
      <div className="w-full px-4 sm:px-6 flex h-11 items-center justify-between gap-4">
        {/* Left: Fixed Module Identity (Same width on all pages) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="h-2 w-2 rounded-[2px] bg-[#d4af37] shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold tracking-tight text-[#102C57] whitespace-nowrap">
            วางแผนการผลิต
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>
          <span className="hidden sm:inline font-mono text-[10px] font-bold uppercase tracking-[1px] text-slate-400">
            PLANNING MODULE
          </span>
        </div>

        {/* Right: The 5 Precision Segmented Tabs (Anchored, never moves) */}
        <nav
          className="flex items-center gap-0.5 rounded-[2px] border border-slate-200 bg-slate-50/80 p-0.5 shrink-0 overflow-x-auto"
          aria-label="เมนูวางแผนการผลิต"
        >
          {PLANNING_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === activeTab;
            let href = tab.href;
            if (isLegacy && tab.key !== "master") {
              href = `${tab.href}?source=legacy`;
            }
            return (
              <Link
                key={tab.key}
                href={href}
                prefetch={true}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex h-7 items-center gap-1.5 rounded-[2px] px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-[var(--surface-navy,#102C57)] text-white shadow-sm font-bold"
                    : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                <Icon size={13} className={isActive ? "text-[#d4af37]" : "text-slate-500"} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Subordinate meta row if provided */}
      {meta ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 sm:px-6 py-1 text-[11px] text-slate-500">
          <div className="w-full flex flex-wrap items-center justify-between gap-2">
            {meta}
          </div>
        </div>
      ) : null}

      {children ? (
        <div className="w-full px-4 sm:px-6 py-2">
          {children}
        </div>
      ) : null}
    </header>
  );
}
