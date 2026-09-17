import ProductionStockLotBalanceSummaryReportPageClient from "@/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient";
import { loadProductionStockLotBalanceSummaryReportData } from "@/lib/production-stock-balance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปคงเหลือราย Lot",
  description: "รายงานสรุปยอดสินค้าคงเหลือราย Lot ของฝ่ายผลิต",
};

export default async function ProductionStockLotBalanceSummaryReportPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const reportData = await loadProductionStockLotBalanceSummaryReportData(undefined, {
    productCodes: Array.isArray(resolvedSearchParams?.productCodes)
      ? resolvedSearchParams.productCodes
      : resolvedSearchParams?.productCodes
      ? [resolvedSearchParams.productCodes]
      : [],
    includeAll: true,
  });

  return (
    <ProductionStockLotBalanceSummaryReportPageClient
      scope={reportData.scope}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
    />
  );
}
