import ProductionPrisonBalanceReportPageClient from "@/features/production-line/components/ProductionPrisonBalanceReportPageClient";
import { loadProductionPrisonLotBalanceReportData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงาน Lot คงค้างเรือนจำ",
  description: "รายงานคงเหลือราย Lot ของเรือนจำ",
};

export default async function ProductionPrisonLotBalanceReportPage() {
  const reportData = await loadProductionPrisonLotBalanceReportData();

  return (
    <ProductionPrisonBalanceReportPageClient
      mode="lot"
      scope={reportData.scope}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
    />
  );
}
