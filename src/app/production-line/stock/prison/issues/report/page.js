import ProductionStockIssueReportPageClient from "@/features/production-line/components/ProductionStockIssueReportPageClient";
import { loadProductionPrisonIssueReportData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

const PRISON_REPORT_TYPES = [{ value: "PRISON", label: "เบิกออกเรือนจำ" }];

export const metadata = {
  title: "รายงานสรุปเบิกออกเรือนจำแบบละเอียด",
  description: "รายงานเบิกออกเรือนจำแบบละเอียด",
};

export default async function ProductionPrisonIssueReportPage() {
  const reportData = await loadProductionPrisonIssueReportData(undefined, {
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueReportPageClient
      scope={reportData.scope}
      issueTypes={PRISON_REPORT_TYPES}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
      reportConfig={{
        eyebrow: "รายงานเรือนจำ",
        badge: "แบบละเอียด",
        title: "รายงานสรุปเบิกออกเรือนจำแบบละเอียด",
        printTitle: "รายงานสรุปเบิกออกเรือนจำแบบละเอียด",
        excelTitle: "รายงานสรุปเบิกออกเรือนจำแบบละเอียด",
        excelFilePrefix: "prison-issue-detail-report",
        emptyMessage: "ยังไม่พบรายการเบิกออกเรือนจำตามเงื่อนไขที่เลือก",
        hideIssueTypeFilter: true,
        hideIssueTypeMeta: true,
        hideIssueTypeGroupHeader: true,
        allowedIssueTypes: ["PRISON"],
      }}
    />
  );
}
