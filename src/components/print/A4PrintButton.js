"use client";

import { Printer } from "lucide-react";

/**
 * Standard A4 Print Action Button
 */
export default function A4PrintButton({
  label = "พิมพ์รายงาน (A4)",
  onClick = null,
  disabled = false,
  className = "",
  size = "md", // sm | md | lg
}) {
  const handlePrint = () => {
    if (onClick) {
      onClick();
    } else if (typeof window !== "undefined") {
      window.print();
    }
  };

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-1.5 text-sm gap-2",
    lg: "px-4 py-2 text-base gap-2.5",
  }[size] || "px-3.5 py-1.5 text-sm gap-2";

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={disabled}
      title="พิมพ์เอกสารมาตรฐาน A4"
      className={`inline-flex items-center justify-center font-semibold rounded-lg shadow-sm transition-colors border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102C57] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
    >
      <Printer className="h-4 w-4 text-[#102C57]" />
      <span>{label}</span>
    </button>
  );
}
