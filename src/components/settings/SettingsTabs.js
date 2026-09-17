"use client";

import { UserPlus, ShieldCheck } from "lucide-react";

const tabs = [
  {
    id: "users",
    label: "สร้างผู้ใช้งาน",
    description: "สร้างบัญชีและกำหนดบทบาท",
    icon: UserPlus,
  },
  {
    id: "roles",
    label: "กำหนดสิทธิ์บทบาท",
    description: "เลือกหน้าและแท็บที่เข้าถึงได้",
    icon: ShieldCheck,
  },
];

export default function SettingsTabs({ activeTab, onChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={isActive}
            className={`group relative overflow-hidden rounded-2xl border transition-all ${isActive
              ? "border-[#d4af37]/70 bg-[#fdf7e6] text-[#102C57] shadow-md"
              : "border-white/15 bg-white/10 text-white/70 hover:bg-white/20"
              }`}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.15),_transparent_60%)]" />
            <div className="relative flex items-center gap-4 p-4">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive
                  ? "bg-[#d4af37] text-[#102C57]"
                  : "bg-white/10 text-white/70"
                  }`}
              >
                <Icon size={20} />
              </span>
              <span className="flex flex-col text-left">
                <span className={`text-sm font-semibold ${isActive ? "text-[#102C57]" : "text-white"}`}>
                  {tab.label}
                </span>
                <span className={`text-[11px] ${isActive ? "text-[#102C57]/70" : "text-white/50"}`}>
                  {tab.description}
                </span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
