import ProductionStockIssueSummaryReportPageClient from "@/features/production-line/components/ProductionStockIssueSummaryReportPageClient";
import { loadProductionPrisonIssueSummaryReportData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

const PRISON_REPORT_TYPES = [{ value: "PRISON", label: "เบิกออกเรือนจำ" }];

export const metadata = {
  title: "รายงานสรุปเบิกออกเรือนจำ",
  description: "รายงานสรุปเบิกออกเรือนจำ",
};

export default async function ProductionPrisonIssueSummaryReportPage() {
  const reportData = await loadProductionPrisonIssueSummaryReportData(undefined, {
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueSummaryReportPageClient
      scope={reportData.scope}
      issueTypes={PRISON_REPORT_TYPES}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
      reportConfig={{
        eyebrow: "รายงานเรือนจำ",
        badge: "ภาพรวม",
        title: "รายงานสรุปเบิกออกเรือนจำ",
        printTitle: "รายงานสรุปเบิกออกเรือนจำ",
        excelWorksheetName: "รายงานสรุปเบิกออกเรือนจำ",
        excelTitle: "รายงานสรุปเบิกออกเรือนจำ",
        excelFilePrefix: "prison-issue-summary-report",
        emptyMessage: "ยังไม่พบข้อมูลรายงานสรุปเบิกออกเรือนจำตามเงื่อนไขที่เลือก",
        hideIssueTypeFilter: true,
        hideIssueTypeColumn: true,
        allowedIssueTypes: ["PRISON"],
      }}
    />
  );
}
