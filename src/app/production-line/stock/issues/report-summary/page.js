import ProductionStockIssueSummaryReportPageClient from "@/features/production-line/components/ProductionStockIssueSummaryReportPageClient";
import { loadProductionStockIssueSummaryReportData } from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปเบิก คืน และใช้จริง",
  description: "รายงานสรุปเบิก คืน และใช้จริง แยกตามวันที่ LOT สินค้า และประเภทการเบิก",
};

export default async function ProductionStockIssueSummaryReportPage({ searchParams }) {
  const params = await searchParams;
  const reportData = await loadProductionStockIssueSummaryReportData(undefined, {
    dateFrom: params?.dateFrom || null,
    dateTo: params?.dateTo || null,
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueSummaryReportPageClient
      reportCenter={params?.reportCenter === "1"}
      scope={reportData.scope}
      issueTypes={reportData.issueTypes}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
      reportConfig={{
        eyebrow: "รายงานเบิกผลิตภัณฑ์",
        badge: "ภาพรวม",
        title: "รายงานสรุปเบิก คืน และใช้จริง",
        printTitle: "รายงานสรุปเบิก-คืน-ใช้จริง",
        excelWorksheetName: "สรุปเบิกคืนใช้จริง",
        excelTitle: "รายงานสรุปเบิก คืน และใช้จริง",
        excelFilePrefix: "stock-issue-summary-report",
        emptyMessage: "ยังไม่พบข้อมูลรายงานสรุปเบิกตามเงื่อนไขที่เลือก",
      }}
    />
  );
}
