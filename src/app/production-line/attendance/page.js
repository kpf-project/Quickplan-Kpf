"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Clock, Gauge, LayoutGrid, PackageCheck, ScanLine } from "lucide-react";
import { usePathname } from "next/navigation";
import { buildAttendanceMenuCards } from "@/lib/attendance-menu-cards";
import { usePermissions } from "@/lib/usePermissions";

const CARD_ICONS = {
  clock: Clock,
  "fg-wip": PackageCheck,
  "weight-scale": Gauge,
  "piece-rate": ScanLine,
};

export default function AttendancePage() {
  const [now, setNow] = useState(() => new Date());
  const pathname = usePathname();
  const isMainTabActive = pathname === "/production-line/attendance";
  const permissionState = usePermissions();
  const menuCards = buildAttendanceMenuCards(permissionState);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = now
    ? now.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    : "...";

  const formattedTime = now
    ? `${now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })} น.`
    : "...";

  return (
    <div className="flex flex-col min-h-screen bg-[#f8f9fa] text-slate-900 font-sans relative overflow-x-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase">
                    สายการผลิต
                  </h6>
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    บันทึกการทำงาน
                  </span>
                </div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold font-serif text-white flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <Clock size={26} className="text-[#d4af37] shrink-0" />
                    <span className="min-w-0 leading-tight text-balance">ลงเวลาและบันทึกงานผลิต</span>
                    <span className="sm:hidden flex items-center gap-1">
                      <Link
                        href="/production-line/attendance"
                        className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${isMainTabActive
                          ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                          : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                          }`}
                        aria-label="เมนูลงเวลา"
                      >
                        <LayoutGrid size={14} />
                      </Link>
                      <Link
                        href="/production-line/attendance/report"
                        className="flex h-7 w-7 items-center justify-center rounded-full border transition border-white/15 text-white/60 hover:text-white hover:border-white/40"
                        aria-label="รายงาน"
                      >
                        <BarChart3 size={14} />
                      </Link>
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
                    <div className="hidden sm:block text-white/70 font-medium" suppressHydrationWarning>
                      {formattedDate} • {formattedTime}
                    </div>
                  </div>
                </h1>
              </div>

              <div className="hidden sm:flex bg-black/20 p-1 rounded-lg self-start lg:self-auto">
                <Link
                  href="/production-line/attendance"
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${isMainTabActive
                    ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <LayoutGrid size={14} />
                  เมนูลงเวลา
                </Link>
                <Link
                  href="/production-line/attendance/report"
                  className="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 text-white/50 hover:text-white hover:bg-white/5"
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
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#f2b90d 0.5px, transparent 0.5px)",
          backgroundSize: "24px 24px",
          opacity: 0.15,
        }}
      ></div>
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-b from-transparent via-white/50 to-white/90"></div>

      <div className="relative flex flex-col min-h-screen layout-container">
        <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 z-10">
          <div className="text-center max-w-2xl mb-12">
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#0a0e1a] mb-4 tracking-tight">
              พร้อมเริ่มงาน
              <span className="bg-gradient-to-br from-[#d4a017] to-[#f2b90d] bg-clip-text text-transparent"> วันนี้</span>
            </h1>
            <p className="text-slate-500 text-lg font-light leading-relaxed">
              เลือกลงเวลา บันทึกผลผลิตและ WIP ชั่งน้ำหนักผลิตภัณฑ์ หรือสแกนงานคิดค่าแรงให้ตรงกับงานในไลน์ผลิต
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 w-full max-w-7xl md:grid-cols-2 xl:grid-cols-4">
            {menuCards.map((card) => {
              const CardIcon = CARD_ICONS[card.icon] || LayoutGrid;
              return (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group relative flex flex-col items-center text-center p-10 bg-[#102C57] rounded-xl overflow-hidden border border-[#f2b90d]/30 transition-all duration-300 hover:border-[#f2b90d] hover:shadow-[0_4px_20px_rgba(242,185,13,0.25)] shadow-xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#f2b90d]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="mb-8 relative">
                    <div className="absolute inset-0 bg-[#f2b90d]/20 blur-2xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-500"></div>
                    <div className="w-24 h-24 rounded-full border border-[#f2b90d]/40 flex items-center justify-center bg-[#0a0e1a]/50 relative z-10 group-hover:border-[#f2b90d] group-hover:scale-105 transition-all shadow-md">
                      <CardIcon size={48} strokeWidth={1} className="text-[#f2b90d]" />
                    </div>
                  </div>

                  <h3 className="text-white text-2xl font-bold mb-4 tracking-tight group-hover:text-[#f2b90d] transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-slate-200 text-sm leading-relaxed max-w-[240px]">
                    {card.description}
                  </p>

                  <div className="mt-8 flex items-center gap-2 text-[#f2b90d] text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                    {card.action} <ArrowRight size={14} />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-16 w-full max-w-6xl p-6 rounded-xl bg-[#102C57] border border-slate-700 flex flex-wrap gap-8 justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
              <span className="text-slate-300 text-sm">
                สถานะอุปกรณ์: <span className="text-white font-medium">พร้อมใช้งาน</span>
              </span>
            </div>
            <div className="flex gap-12 text-right md:text-left">
              <div className="flex flex-col">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">วันที่ปัจจุบัน</span>
                <span className="text-white text-lg font-bold" suppressHydrationWarning>
                  {formattedDate}
                </span>
              </div>
              <div className="flex flex-col border-l border-slate-600 pl-8">
                <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">เวลาปัจจุบัน</span>
                <span className="text-white text-lg font-bold tabular-nums" suppressHydrationWarning>
                  {formattedTime}
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
