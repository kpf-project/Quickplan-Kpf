"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Clock3, LayoutGrid, ScanLine, ScrollText } from "lucide-react";

const REPORT_LINKS = [
  {
    href: "/production-line/attendance/report/scan-events",
    title: "รายงานเข้า-ออกงาน",
    description: "สรุปรายการสแกนเข้า-ออกงานตามวัน พร้อมเวลาสแกนและผู้บันทึก",
    icon: Clock3,
  },
  {
    href: "/production-line/attendance/report/piece-rate",
    title: "รายงานสแกนคิดค่าแรง",
    description: "รายงานสแกนสินค้าและพนักงาน พร้อมน้ำหนักรวม และค่าแรงตามสิทธิ์",
    icon: ScanLine,
  },
  {
    href: "/production-line/attendance/report/piece-rate-stock",
    title: "รายงานความเคลื่อนไหวสต็อกป้ายแยม",
    description: "ตรวจสอบชั่งเข้า เบิก ชั่งคืน ยกเลิกชั่ง และยกเลิกเบิก พร้อมสินค้าและ LOT",
    icon: ScrollText,
  },
];

export default function AttendanceReportHubPageClient() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8f9fa] text-slate-900">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] text-white shadow-xl">
        <div className="mx-auto max-w-[95%] py-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h6 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    สายการผลิต
                  </h6>
                  <span className="rounded-full bg-[#d4af37] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#102C57]">
                    เมนูรายงาน
                  </span>
                </div>
                <h1 className="mt-2 flex items-center gap-2 text-lg font-bold text-white sm:text-xl md:text-2xl">
                  <BarChart3 size={24} className="text-[#d4af37]" />
                  ศูนย์รวมรายงานงานผลิต
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-white/70">
                  เลือกประเภทรายงานที่ต้องการเปิดดูหรือพิมพ์ โดยแต่ละหน้าจะคงรูปแบบการใช้งานเฉพาะของแต่ละงานไว้แยกกัน
                </p>
              </div>

              <div className="flex rounded-lg bg-black/20 p-1">
                <Link
                  href="/production-line/attendance"
                  className="flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  <LayoutGrid size={14} />
                  เมนูลงเวลา
                </Link>
                <Link
                  href="/production-line/attendance/report"
                  className="flex items-center gap-1.5 rounded-md bg-[#d4af37] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#102C57] shadow-sm"
                >
                  <BarChart3 size={14} />
                  รายงาน
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: "radial-gradient(#f2b90d 0.5px, transparent 0.5px)",
          backgroundSize: "24px 24px",
          opacity: 0.12,
        }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-white/50 to-white/90" />

      <div className="layout-container relative z-10 mx-auto flex min-h-[calc(100vh-110px)] max-w-7xl flex-col px-6 py-10">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {REPORT_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative flex min-h-[280px] flex-col rounded-2xl border border-[#d4af37]/25 bg-[var(--surface-navy,#102C57)] p-8 text-white shadow-xl transition-all duration-300 hover:border-[#f2b90d] hover:shadow-[0_10px_30px_rgba(242,185,13,0.18)]"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#f2b90d]/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-[#f2b90d]/40 bg-[#0a0e1a]/45 text-[#f2b90d] shadow-md transition-all group-hover:scale-105 group-hover:border-[#f2b90d]">
                    <Icon size={40} strokeWidth={1.3} />
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight transition-colors group-hover:text-[#f2b90d]">
                    {item.title}
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-slate-200">
                    {item.description}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-8 text-xs font-bold uppercase tracking-widest text-[#f2b90d] opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    เปิดรายงาน
                    <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
