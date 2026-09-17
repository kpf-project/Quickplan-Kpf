"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bell,
  ClipboardList,
  Factory,
  FileText,
  SearchX,
  Table2,
} from "lucide-react";

const PLANNING_TABS = [
  { key: "master", href: "/production-line/planning/schedule", label: "แผนหลัก", icon: ClipboardList },
  { key: "plan", href: "/production-line/planning/plan", label: "งานแผนก", icon: Factory },
  { key: "report", href: "/production-line/planning/report", label: "รายงาน & ปรับแผน", icon: Table2 },
  { key: "requisition-preview", href: "/production-line/planning/requisition-preview", label: "Preview ใบเบิก", icon: FileText },
  { key: "expired", href: "/production-line/planning/expired", label: "หมดอายุ", icon: SearchX },
  { key: "notifications", href: "/production-line/planning/notifications", label: "แจ้งเตือน", icon: Bell },
];

const HEADER_COPY = {
  master: {
    title: "แผนหลัก",
    description: "วางแผนรวมทั้งโรงงาน สร้างฉบับร่าง และเผยแพร่เพื่อส่งต่อให้แต่ละแผนกดำเนินงาน",
  },
  plan: {
    title: "งานแผนก",
    description: "ติดตามงานจากแผนหลักที่เผยแพร่แล้ว และยืนยันแผนย่อยตามสิทธิ์ของแต่ละแผนก",
  },
  report: {
    title: "รายงาน & ปรับแผน",
    description: "ศูนย์ควบคุมและรายงานผลผลิตแบบบูรณาการ ดูแลและปรับปรุงแผนการผลิตประจำสัปดาห์รายแผนก",
  },
  "requisition-preview": {
    title: "Preview ใบเบิก",
    description: "ตรวจสอบการแตกใบเบิกรายวันตามห้องผลิต เจ้าของวัตถุดิบ และกะ ก่อนสร้างใบเบิกจริง",
  },
  expired: {
    title: "รายการหมดอายุ",
    description: "ติดตามรายการที่พ้นกำหนด เพื่อให้ทีมวางแผนจัดการต่อได้ทันเวลา",
  },
  notifications: {
    title: "แจ้งเตือนแผนการผลิต",
    description: "จัดการการรับแจ้งเตือนเมื่อเผยแพร่แผนหลักหรือยืนยันแผนย่อยสำเร็จ",
  },
};

export function getPlanningHeaderCopy(activeTab) {
  return HEADER_COPY[activeTab] || {
    title: "วางแผนการผลิต",
    description: "จัดการแผนการผลิต ติดตามสถานะ และทำงานต่อเนื่องระหว่างแผนหลัก แผนย่อย และวัตถุดิบ",
  };
}

export default function PlanningHeader({
  activeTab = "master",
  title,
  description,
  eyebrow = "Production Planning",
  meta,
  toolbar,
  children,
  compact = false,
  maxWidth = "max-w-7xl",
}) {
  const copy = getPlanningHeaderCopy(activeTab);
  const resolvedTitle = title || copy.title;
  const resolvedDescription = description || copy.description;
  const searchParams = useSearchParams();
  const source = searchParams?.get("source") || searchParams?.get("dataSource") || "";
  const isLegacy = source.toLowerCase() === "legacy";

  return (
    <header className="bg-gradient-to-r from-[#102C57] to-[#0f172a] px-4 text-white shadow-lg sm:px-6 print:hidden">
      <div className={`mx-auto ${maxWidth} ${compact ? "py-3" : "py-5"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 opacity-85">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">{eyebrow}</span>
              <span className="h-px w-6 bg-white/20" />
            </div>
            <h1 className={`${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"} flex items-center gap-3 font-bold tracking-normal text-white`}>
              <FileText className="text-[#d4af37]" size={compact ? 22 : 28} />
              {resolvedTitle}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-6 text-white/62 sm:text-sm">{resolvedDescription}</p>
          </div>

          {toolbar ? (
            <div className="w-full rounded-lg border border-white/10 bg-black/20 p-3 lg:w-auto lg:min-w-[320px]">
              {toolbar}
            </div>
          ) : null}
        </div>

        <nav className="mt-4 overflow-x-auto rounded-lg bg-black/20 p-1" aria-label="เมนูวางแผนการผลิต">
          <div className="flex min-w-max items-center gap-1">
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
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-bold uppercase tracking-wider transition-all sm:px-3 ${
                    isActive
                      ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={12} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {meta ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/62">{meta}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </header>
  );
}
