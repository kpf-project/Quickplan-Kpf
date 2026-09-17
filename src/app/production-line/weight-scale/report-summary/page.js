import WeightScaleSummaryReportPageClient from "@/features/production-line/components/WeightScaleSummaryReportPageClient";
import { loadScaleProductsData } from "@/lib/scale/products";
import { loadScaleReceiptSummaryReportData } from "@/lib/scale/receipts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปชั่งเข้าสำเร็จ",
  description: "รายงานสรุปรายการชั่งเข้าสำเร็จ แยกตาม LOT และสินค้า พร้อมส่งออกและพิมพ์รายงาน",
};

function getTodayDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadInitialWeightScaleSummaryReportData(searchParams) {
  try {
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const initialProductsPayload = await loadScaleProductsData();
    const departmentId = initialProductsPayload?.preset?.departmentId || null;
    const departmentName = initialProductsPayload?.preset?.departmentName || "แผนกบิสกิต";
    const today = getTodayDateInput();

    const dateFrom = resolvedSearchParams?.dateFrom || today;
    const dateTo = resolvedSearchParams?.dateTo || today;
    const productCodes = Array.isArray(resolvedSearchParams?.productCodes)
      ? resolvedSearchParams.productCodes
      : resolvedSearchParams?.productCodes
      ? [resolvedSearchParams.productCodes]
      : [];

    const productOptions = Array.isArray(initialProductsPayload?.products)
      ? initialProductsPayload.products
          .map((product) => ({
            code: String(product?.code || "").trim().toUpperCase(),
            name: String(product?.name || "").trim() || "-",
          }))
          .filter((product) => product.code)
      : [];

    return {
      departmentId,
      departmentName,
      productOptions,
      initialReportPayload: await loadScaleReceiptSummaryReportData(undefined, {
        departmentId,
        dateFrom,
        dateTo,
        productCodes,
        includeAll: true,
        limit: 1000,
        page: 1,
        summaryChunkSize: 20,
      }),
    };
  } catch (error) {
    console.error("[weight-scale-summary-report] Failed to load initial report", error);

    const today = getTodayDateInput();
    return {
      departmentId: null,
      departmentName: "แผนกบิสกิต",
      productOptions: [],
      initialReportPayload: {
        available: false,
        rows: [],
        summary: {
          totalCount: 0,
          totalQuantity: 0,
          totalNetWeightKg: 0,
        },
        filters: {
          dateFrom: today,
          dateTo: today,
          productCodes: [],
        },
        pagination: {
          page: 1,
          limit: 1000,
          totalCount: 0,
          totalPages: 0,
        },
      },
    };
  }
}

export default async function ProductionLineWeightScaleSummaryReportPage({ searchParams }) {
  const { departmentId, departmentName, productOptions, initialReportPayload } =
    await loadInitialWeightScaleSummaryReportData(searchParams);

  return (
    <WeightScaleSummaryReportPageClient
      departmentId={departmentId}
      departmentName={departmentName}
      productOptions={productOptions}
      initialReportPayload={initialReportPayload}
    />
  );
}
