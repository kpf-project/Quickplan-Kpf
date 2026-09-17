import ProductionPrisonIssuePageClient from "@/features/production-line/components/ProductionPrisonIssuePageClient";
import { loadProductionPrisonIssuePageData } from "@/lib/production-prison";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "สแกนเบิกออกเรือนจำ",
  description: "สแกนบาร์โค้ดเพื่อเบิกออกเรือนจำจากรายการรับเข้าเรือนจำ",
};

export default async function ProductionPrisonIssuePage() {
  const pageData = await loadProductionPrisonIssuePageData();

  return (
    <ProductionPrisonIssuePageClient
      todayIssueDate={pageData.todayIssueDate}
      initialRecentIssues={pageData.recentIssues}
      initialSummary={pageData.summary}
      scope={pageData.scope}
    />
  );
}
