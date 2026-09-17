import ProductionPrisonBalanceReportPageClient from "@/features/production-line/components/ProductionPrisonBalanceReportPageClient";
import { loadProductionPrisonMovementSummaryReportData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุป ชั่ง-เบิก เรือนจำ",
  description: "รายงานสรุปการรับเข้าและเบิกออกของเรือนจำ",
};

export default async function ProductionPrisonMovementSummaryReportPage() {
  const reportData = await loadProductionPrisonMovementSummaryReportData();

  return (
    <ProductionPrisonBalanceReportPageClient
      mode="summary"
      scope={reportData.scope}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
    />
  );
}
