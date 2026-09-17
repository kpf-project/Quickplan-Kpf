"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, LayoutGrid, Clock } from "lucide-react";
import { usePathname } from "next/navigation";

export default function AttendanceHeaderClient() {
  const [now, setNow] = useState(() => new Date());
  const pathname = usePathname();
  const isMainTabActive = pathname === "/production-line/attendance";

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
    <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
      <div className="max-w-[95%] mx-auto py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase">สายการผลิต</h6>
                <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">บันทึกการทำงาน</span>
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
  );
}
