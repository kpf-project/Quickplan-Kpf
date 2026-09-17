export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1e293b] font-sans">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-40 rounded bg-white/20" />
            <div className="h-6 w-72 rounded bg-white/20" />
            <div className="h-9 w-full rounded bg-white/10" />
          </div>
        </div>
      </div>
      <div className="max-w-[98%] mx-auto w-full px-0 pb-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mt-4">
          <div className="p-6 animate-pulse space-y-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={`loading-row-${index}`} className="h-4 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
