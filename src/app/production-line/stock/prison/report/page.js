import ProductionStockIssueReportPageClient from "@/features/production-line/components/ProductionStockIssueReportPageClient";
import {
  loadProductionStockIssueReportData,
  PRODUCTION_STOCK_PRISON_ISSUE_TYPES,
  PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
} from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานรับเข้าเรือนจำแบบละเอียด",
  description: "รายงานรับเข้าเรือนจำแบบละเอียดจากรายการเบิกประเภทเรือนจำ",
};

export default async function ProductionStockPrisonDetailedReportPage() {
  const reportData = await loadProductionStockIssueReportData(undefined, {
    issueTypes: PRODUCTION_STOCK_PRISON_ISSUE_TYPES,
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueReportPageClient
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
        badge: "แบบละเอียด",
        title: "รายงานสรุปรับเข้าเรือนจำแบบละเอียด",
        description:
          "แสดงรายการรับเข้าเรือนจำจากบาร์โค้ดที่เบิกประเภทเรือนจำ พร้อมจัดกลุ่มตามวันที่ LOT และสินค้า",
        printTitle: "รายงานสรุปรับเข้าเรือนจำแบบละเอียด",
        excelTitle: "รายงานสรุปรับเข้าเรือนจำแบบละเอียด",
        excelFilePrefix: "prison-inbound-detail-report",
        emptyMessage: "ยังไม่พบรายการรับเข้าเรือนจำตามเงื่อนไขที่เลือก",
        hideIssueTypeFilter: true,
      }}
    />
  );
}
