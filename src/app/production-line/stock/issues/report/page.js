import ProductionStockIssueReportPageClient from "@/features/production-line/components/ProductionStockIssueReportPageClient";
import { loadProductionStockIssueReportData } from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานเบิกผลิตภัณฑ์แบบละเอียด",
  description: "รายงานเบิกแบบละเอียด พร้อมจัดกลุ่มตามวันที่ LOT สินค้า และประเภทการเบิก",
};

export default async function ProductionStockIssueReportPage({ searchParams }) {
  const params = await searchParams;
  const reportData = await loadProductionStockIssueReportData(undefined, {
    dateFrom: params?.dateFrom || null,
    dateTo: params?.dateTo || null,
    includeAll: true,
    limit: 1000,
  });

  return (
    <ProductionStockIssueReportPageClient
      scope={reportData.scope}
      issueTypes={reportData.issueTypes}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
      reportConfig={{
        eyebrow: "รายงานเบิกผลิตภัณฑ์",
        badge: "แบบละเอียด",
        title: "รายงานสรุปเบิกแบบละเอียด",
        description:
          "แสดงรายการเบิกตามบาร์โค้ด พร้อมจัดกลุ่มตาม วันที่ / LOT / สินค้า / ประเภทการเบิก และสรุปรวมท้ายกลุ่ม",
        printTitle: "รายงานสรุปเบิกแบบละเอียด",
        excelTitle: "รายงานสรุปเบิกแบบละเอียด",
        excelFilePrefix: "stock-issue-detail-report",
        emptyMessage: "ยังไม่พบรายการเบิกตามเงื่อนไขที่เลือก",
      }}
    />
  );
}
