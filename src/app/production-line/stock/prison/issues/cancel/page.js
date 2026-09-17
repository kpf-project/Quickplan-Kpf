import ProductionPrisonCancelPageClient from "@/features/production-line/components/ProductionPrisonCancelPageClient";
import { loadProductionPrisonIssueCancelPageData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ยกเลิกเบิกเรือนจำ",
  description: "สแกนบาร์โค้ดหรือเลือกรายการย้อนหลังเพื่อยกเลิกเบิกเรือนจำ",
};

export default async function ProductionPrisonIssueCancelPage() {
  const pageData = await loadProductionPrisonIssueCancelPageData();

  return (
    <ProductionPrisonCancelPageClient
      mode="issue"
      scope={pageData.scope}
      todayIssueDate={pageData.todayIssueDate}
      initialRows={pageData.rows}
      initialSummary={pageData.summary}
      initialFilters={pageData.filters}
      initialPagination={pageData.pagination}
    />
  );
}
