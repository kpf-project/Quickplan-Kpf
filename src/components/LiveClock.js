"use client";

import { memo, useEffect, useState } from "react";

function LiveClock({ plain = false }) {
  const [time, setTime] = useState(null);

  useEffect(() => {
    // Avoid synchronous state update to prevent hydration mismatch warning
    const raf = requestAnimationFrame(() => {
      setTime(new Date());
    });
    
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, []);

  const format = (n) => String(n).padStart(2, "0");
  const mounted = time !== null;
  const hours = mounted ? format(time.getHours()) : "--";
  const minutes = mounted ? format(time.getMinutes()) : "--";
  const seconds = mounted ? format(time.getSeconds()) : "00";

  if (plain) {
    const date = mounted ? `${format(time.getDate())}/${format(time.getMonth() + 1)}/${time.getFullYear()}` : "--/--/----";
    return <span className="whitespace-nowrap text-[10px] font-medium text-slate-500">ข้อมูล ณ {date} {hours}:{minutes}</span>;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/20 border border-white/10 rounded-xl font-mono text-sm text-white shadow-inner backdrop-blur-md">
      <div className="flex items-center tracking-wider text-white/90">
        <span>{hours}</span>
        <span className="mx-0.5 animate-pulse text-[#d4af37]">:</span>
        <span>{minutes}</span>
      </div>
      <div className="h-4 w-[1px] bg-white/10"></div>
      <div className="flex items-center font-bold text-[#d4af37] text-base w-[1.4em] justify-center">
        {seconds}
      </div>
    </div>
  );
}

export default memo(LiveClock);
