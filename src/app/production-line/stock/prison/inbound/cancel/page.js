import ProductionPrisonCancelPageClient from "@/features/production-line/components/ProductionPrisonCancelPageClient";
import { loadProductionPrisonInboundCancelPageData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ยกเลิกชั่งเรือนจำ",
  description: "สแกนบาร์โค้ดหรือเลือกรายการย้อนหลังเพื่อยกเลิกชั่งเรือนจำ",
};

export default async function ProductionPrisonInboundCancelPage() {
  const pageData = await loadProductionPrisonInboundCancelPageData();

  return (
    <ProductionPrisonCancelPageClient
      mode="inbound"
      scope={pageData.scope}
      todayIssueDate={pageData.todayIssueDate}
      initialRows={pageData.rows}
      initialSummary={pageData.summary}
      initialFilters={pageData.filters}
      initialPagination={pageData.pagination}
    />
  );
}
