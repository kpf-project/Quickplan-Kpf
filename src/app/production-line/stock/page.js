import { FileUp } from "lucide-react";
import ProductionStockOpeningBalanceImportClient from "@/features/production-line/components/ProductionStockOpeningBalanceImportClient";
import { loadProductionStockOpeningBalancePageData } from "@/lib/production-stock-opening-balances";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "นำเข้าสต็อกตั้งต้นไลน์ผลิต",
  description:
    "นำเข้ายอดตั้งต้นสำหรับสินค้าในหมวด 03 ของแผนก KP13 เพื่อเตรียมเริ่มต้น stock movement ในระบบใหม่",
};

function HeaderStat({ label, value, detail }) {
  return (
    <div className="border border-[#31435b] bg-[#0d1a2b] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d4af37]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-white/60">{detail}</p> : null}
    </div>
  );
}

export default async function ProductionStockOpeningBalancePage() {
  const pageData = await loadProductionStockOpeningBalancePageData();

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <section className="border-b border-[#1f3047] bg-[#08111d] text-white">
        <div className="mx-auto max-w-[84rem] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-black uppercase tracking-[0.28em] text-[#d4af37]">
                  Stock Foundation
                </span>
                <span className="border border-[#d4af37]/40 bg-white/[0.05] px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
                  Opening Balance
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-bold uppercase leading-[1.08] tracking-[0.08em] text-white sm:text-[2.6rem]">
                นำเข้าสต็อกตั้งต้นไลน์ผลิต
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">
                หน้านี้ใช้สำหรับนำเข้ายอดยกมาตั้งต้นของสินค้าในหมวด 03 ที่ผูกกับ KP13
                ก่อนเริ่มใช้ flow รับเข้า เบิก ใช้จริง และคืนในระบบใหม่ โดยยังอ้างอิง
                master สินค้าจาก ERP ตามเดิม
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-px overflow-hidden border border-[#31435b] bg-[#31435b] sm:grid-cols-4">
            <HeaderStat
              label="แผนก"
              value={pageData.scope.departmentCode || "KP13"}
            />
            <HeaderStat
              label="หมวดสินค้า"
              value={pageData.scope.categoryCode || "03"}
            />
            <HeaderStat
              label="สินค้าในขอบเขต"
              value={String(pageData.scope.products?.length || 0)}
            />
            <HeaderStat
              label="รอบนำเข้าล่าสุด"
              value={String(pageData.recentImportBatches.length || 0)}
              detail="ใช้ตรวจสอบประวัติการตั้งต้นก่อนเริ่มใช้งานจริง"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-[#d7dde5] border-t-2 border-t-[#d4af37] bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
              Opening Balance Import
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#102C57]">
              ตั้งต้นสต็อกให้ตรงกับ ERP ก่อน cutover
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#546274]">
              หลังจากนำเข้ายอดยกมาเรียบร้อย ระบบจะพร้อมให้เราไปต่อหน้าเบิกและรายงานสรุปได้ทันที โดยไม่ต้องมีหน้าฐานสต็อกแยกอีก
            </p>
          </div>

          <div className="inline-flex items-center gap-2 border border-[#d4af37]/35 bg-[#fff8df] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#7f5d00]">
            <FileUp size={16} />
            Import รอบแรกให้ตรงกับ ERP ก่อนเริ่มใช้งานจริง
          </div>
        </div>

        <ProductionStockOpeningBalanceImportClient
          scope={pageData.scope}
          recentImportBatches={pageData.recentImportBatches}
          latestOpeningBalances={pageData.latestOpeningBalances}
        />
      </div>
    </div>
  );
}
