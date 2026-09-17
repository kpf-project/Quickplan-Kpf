import ProductionStockMovementSummaryReportPageClient from "@/features/production-line/components/ProductionStockMovementSummaryReportPageClient";
import { loadProductionStockMovementSummaryReportData } from "@/lib/production-stock-balance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานเคลื่อนไหวสินค้า",
  description: "รายงานการเคลื่อนไหวและการชั่งรับเข้าเบิกออกของผลิตภัณฑ์",
};

export default async function ProductionStockMovementSummaryReportPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const reportData = await loadProductionStockMovementSummaryReportData(undefined, {
    dateFrom: resolvedSearchParams?.dateFrom || null,
    dateTo: resolvedSearchParams?.dateTo || null,
    productCodes: Array.isArray(resolvedSearchParams?.productCodes)
      ? resolvedSearchParams.productCodes
      : resolvedSearchParams?.productCodes
      ? [resolvedSearchParams.productCodes]
      : [],
    lotNos: Array.isArray(resolvedSearchParams?.lotNos)
      ? resolvedSearchParams.lotNos
      : resolvedSearchParams?.lotNos
      ? [resolvedSearchParams.lotNos]
      : [],
    includeAll: true,
  });

  return (
    <ProductionStockMovementSummaryReportPageClient
      scope={reportData.scope}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
    />
  );
}
