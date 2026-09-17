import ProductionStockLotBalanceReportPageClient from "@/features/production-line/components/ProductionStockLotBalanceReportPageClient";
import { loadProductionStockLotBalanceSummaryReportData } from "@/lib/production-stock-balance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปคงเหลือราย Lot (A4)",
  description: "รายงานสรุปสินค้าคงเหลือแยกตาม Lot สำหรับพิมพ์แนวตั้ง",
};

export default async function ProductionStockLotBalanceReportPage({ searchParams }) {
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
    <ProductionStockLotBalanceReportPageClient
      scope={reportData.scope}
      initialRows={reportData.rows}
      initialSummary={reportData.summary}
      initialFilters={reportData.filters}
      initialPagination={reportData.pagination}
    />
  );
}
