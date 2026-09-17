function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse bg-slate-200/80 ${className}`} />;
}

export default function ProductionLineLoading() {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#102C57]">
      <section className="bg-gradient-to-r from-[#102C57] via-[#122b4d] to-[#0f172a] px-4 py-5 shadow-xl sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[84rem]">
          <div className="flex flex-wrap items-center gap-3">
            <SkeletonBlock className="h-8 w-28 bg-white/15" />
            <SkeletonBlock className="h-8 w-32 bg-white/15" />
            <SkeletonBlock className="h-8 w-24 bg-white/15" />
            <SkeletonBlock className="h-8 w-36 bg-white/15" />
          </div>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-none flex-col gap-6 px-3 py-8 sm:px-4 lg:px-6 2xl:px-8">
        <div className="border-2 border-[#d4af37] bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid flex-1 gap-4 md:grid-cols-3">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
            </div>
            <div className="flex flex-wrap gap-3">
              <SkeletonBlock className="h-12 w-28" />
              <SkeletonBlock className="h-12 w-32" />
              <SkeletonBlock className="h-12 w-36" />
            </div>
          </div>

          <div className="mt-8 grid gap-px bg-[#d7dde5] md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-white px-5 py-5">
                <SkeletonBlock className="mx-auto h-3 w-24" />
                <SkeletonBlock className="mx-auto mt-3 h-8 w-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[305mm] border border-[#94a3b8] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between border-b border-[#94a3b8] pb-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-11 w-11 rounded-full" />
              <div>
                <SkeletonBlock className="h-4 w-44" />
                <SkeletonBlock className="mt-2 h-3 w-28" />
              </div>
            </div>
            <SkeletonBlock className="h-6 w-52" />
            <div className="flex flex-col items-end gap-2">
              <SkeletonBlock className="h-3 w-32" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <SkeletonBlock className="h-9 w-full" />
            {Array.from({ length: 10 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-7 w-full" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
