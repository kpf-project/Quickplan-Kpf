"use client";

import { Boxes } from "lucide-react";

export default function ProductsShell({
  title,
  description,
  totalRecords,
  badgeText = "รายงาน",
  toolbar,
  icon: Icon = Boxes,
  children,
}) {
  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase mb-0.5">
                  {description ?? "ข้อมูลสินค้า"}
                </h6>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex items-center gap-3">
                  <Icon size={28} className="text-[#d4af37]" />
                  {title}
                  {typeof totalRecords === "number" && (
                    <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                      {totalRecords.toLocaleString()} {badgeText}
                    </span>
                  )}
                </h1>
              </div>
            </div>
            {toolbar}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-w-[98%] mx-auto w-full px-0 pb-4 relative z-10">
        {children}
      </div>
    </div>
  );
}
