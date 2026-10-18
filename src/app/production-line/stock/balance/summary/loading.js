import { Loader2 } from "lucide-react";

export default function StockMovementSummaryLoading() {
  return (
    <div className="min-h-screen bg-[#f4f6f9] pb-12">
      {/* Header Skeleton */}
      <div className="bg-[var(--surface-navy,#102C57)] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded bg-white/20" />
            <div>
              <div className="h-4 w-48 animate-pulse rounded bg-white/20" />
              <div className="mt-1 h-3 w-32 animate-pulse rounded bg-white/10" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 animate-pulse rounded bg-white/20" />
            <div className="h-9 w-24 animate-pulse rounded bg-white/20" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6">
        {/* Filter Bar Skeleton */}
        <div className="flex flex-col gap-4 border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-10 w-48 animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-32 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="animate-spin text-[#102C57]" size={20} />
            <span className="text-xs font-bold text-slate-500">กำลังโหลดรายงานการเคลื่อนไหว...</span>
          </div>
        </div>

        {/* Table Skeleton Container */}
        <div className="mt-6 border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div className="h-5 w-64 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
