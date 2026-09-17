"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileText } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/production-line/stock/issues",
    label: "เบิกผลิตภัณฑ์",
    shortLabel: "เบิกผลิตภัณฑ์",
    icon: ClipboardList,
  },
  {
    href: "/production-line/stock/issues/report",
    label: "รายงานเบิก",
    shortLabel: "รายงานเบิก",
    icon: FileText,
  },
];

function isActivePath(pathname, href) {
  if (!pathname || !href) {
    return false;
  }

  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
}

export default function ProductionStockIssueHeader({
  eyebrow = "ระบบเบิกผลิตภัณฑ์",
  badge = "พร้อมใช้งาน",
  title,
  description = "",
  actions = null,
}) {
  const pathname = usePathname();

  return (
    <section className="relative z-[100] bg-gradient-to-r from-[#102C57] via-[#122b4d] to-[#0f172a] text-white shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_60%)]" />

      <div className="relative mx-auto max-w-[84rem] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d4af37]">
                  {eyebrow}
                </span>
                <span className="border border-[#d4af37]/40 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
                  {badge}
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-bold uppercase leading-[1.08] tracking-[0.08em] text-white sm:text-[2.6rem]">
                {title}
              </h1>

              {description ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{description}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">{actions}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            {NAV_ITEMS.map((item) => {
              const isActive = isActivePath(pathname, item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-10 items-center justify-center gap-2 border px-4 text-sm font-black uppercase tracking-[0.12em] transition-all duration-200 ${
                    isActive
                      ? "border-[#d4af37] bg-[#d4af37] text-[#102C57] shadow-[0_4px_12px_rgba(212,175,55,0.25)]"
                      : "border-white/10 bg-white/5 text-white/85 hover:border-[#d4af37] hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
