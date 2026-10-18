import ProductionStockIssuePageClient from "@/features/production-line/components/ProductionStockIssuePageClient";
import { loadProductionStockIssuePageData } from "@/lib/production-stock-issues";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "เบิกผลิตภัณฑ์",
  description: "สแกนบาร์โค้ดเพื่อบันทึกรายการเบิกและลดสต็อกผ่าน stock movement แบบมาตรฐาน",
};

export default async function ProductionStockIssuePage() {
  const pageData = await loadProductionStockIssuePageData();

  return (
    <ProductionStockIssuePageClient
      scope={pageData.scope}
      issueTypes={pageData.issueTypes}
      destinationRooms={pageData.destinationRooms}
      todayIssueDate={pageData.todayIssueDate}
      initialRecentIssues={pageData.recentIssues}
      initialSummary={pageData.summary}
    />
  );
}
