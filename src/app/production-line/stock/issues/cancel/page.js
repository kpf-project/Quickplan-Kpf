import ProductionStockIssueCancelPageClient from "@/features/production-line/components/ProductionStockIssueCancelPageClient";
import { loadProductionStockIssueCancelPageData } from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ยกเลิกเบิกผลิตภัณฑ์",
  description:
    "ยกเลิกการเบิกสินค้าด้วยการสแกนบาร์โค้ด ค้นหารายการย้อนหลัง และคืนสต็อกกลับผ่าน stock movement อย่างถูกต้อง",
};

export default async function ProductionStockIssueCancelPage() {
  const pageData = await loadProductionStockIssueCancelPageData();

  return (
    <ProductionStockIssueCancelPageClient
      scope={pageData.scope}
      issueTypes={pageData.issueTypes}
      todayIssueDate={pageData.todayIssueDate}
      initialRows={pageData.rows}
      initialSummary={pageData.summary}
      initialFilters={pageData.filters}
      initialPagination={pageData.pagination}
    />
  );
}
