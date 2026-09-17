import ProductionStockIssueSummaryReportPageClient from "@/features/production-line/components/ProductionStockIssueSummaryReportPageClient";
import {
  loadProductionStockIssueSummaryReportData,
  PRODUCTION_STOCK_PRISON_ISSUE_TYPES,
  PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
} from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปรับเข้าเรือนจำ",
  description: "รายงานสรุปรับเข้าเรือนจำจากรายการเบิกประเภทเรือนจำ",
};

export default async function ProductionStockPrisonSummaryReportPage() {
  const reportData = await loadProductionStockIssueSummaryReportData(undefined, {
    issueTypes: PRODUCTION_STOCK_PRISON_ISSUE_TYPES,
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueSummaryReportPageClient
      scope={reportData.scope}
      issueTypes={PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS.filter((option) =>
        PRODUCTION_STOCK_PRISON_ISSUE_TYPES.includes(option.value)
      )}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
      reportConfig={{
        eyebrow: "รายงานเรือนจำ",
        badge: "ภาพรวม",
        title: "รายงานสรุปรับเข้าเรือนจำ",
        printTitle: "รายงานสรุปรับเข้าเรือนจำ",
        excelWorksheetName: "รายงานสรุปรับเข้าเรือนจำ",
        excelTitle: "รายงานสรุปรับเข้าเรือนจำ",
        excelFilePrefix: "prison-inbound-summary-report",
        emptyMessage: "ยังไม่พบข้อมูลรายงานสรุปรับเข้าเรือนจำตามเงื่อนไขที่เลือก",
        hideIssueTypeFilter: true,
        hideIssueTypeColumn: true,
      }}
    />
  );
}
