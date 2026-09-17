import WeightScaleReportPageClient from "@/features/production-line/components/WeightScaleReportPageClient";
import { loadScaleProductsData } from "@/lib/scale/products";
import { loadScaleReceiptReportData } from "@/lib/scale/receipts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานชั่งน้ำหนักย้อนหลัง",
  description: "รายงานย้อนหลังและพิมพ์ฉลากซ้ำสำหรับการชั่งน้ำหนักผลิตภัณฑ์",
};

function getTodayDateInput() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadInitialWeightScaleReportData(searchParams) {
  try {
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const initialProductsPayload = await loadScaleProductsData();
    const departmentId = initialProductsPayload?.preset?.departmentId || null;
    const departmentName = initialProductsPayload?.preset?.departmentName || "แผนกบิสกิต";
    const today = getTodayDateInput();
    
    const dateFrom = resolvedSearchParams?.dateFrom || today;
    const dateTo = resolvedSearchParams?.dateTo || today;
    const search = resolvedSearchParams?.search || "";
    const lotNo = resolvedSearchParams?.lotNo || "";
    const isTest = resolvedSearchParams?.isTest === "test" ? true : resolvedSearchParams?.isTest === "actual" ? false : null;
    const requestedItemStatus = String(resolvedSearchParams?.itemStatus || "").trim().toLowerCase();
    const itemStatus = ["confirmed", "available", "issued", "voided"].includes(requestedItemStatus)
      ? requestedItemStatus
      : "confirmed";
    const maxItems = resolvedSearchParams?.maxItems ? Number.parseInt(String(resolvedSearchParams.maxItems), 10) || "" : "";
    const requestedRecordType = String(resolvedSearchParams?.recordType || "").trim().toLowerCase();
    const recordType = ["all", "production", "return"].includes(requestedRecordType)
      ? requestedRecordType
      : "all";
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

    const initialReportPayload = await loadScaleReceiptReportData(undefined, {
      departmentId,
      dateFrom,
      dateTo,
      search,
      lotNo,
      isTest,
      itemStatus,
      productCodes,
      includeAll: true,
      limit: 100000,
      page: 1,
      recordType,
    });

    if (initialReportPayload && initialReportPayload.filters) {
      initialReportPayload.filters.itemStatus = itemStatus;
      initialReportPayload.filters.maxItems = maxItems;
      initialReportPayload.filters.recordType = recordType;
    }

    return {
      departmentId,
      departmentName,
      productOptions,
      initialReportPayload,
    };
  } catch (error) {
    console.error("[weight-scale-report] Failed to load initial report", error);

    const today = getTodayDateInput();
    return {
      departmentId: null,
      departmentName: "แผนกบิสกิต",
      productOptions: [],
      initialReportPayload: {
        available: false,
        receipts: [],
        summary: {
          totalCount: 0,
          actualCount: 0,
          testCount: 0,
          totalNetWeightKg: 0,
        },
        filters: {
          dateFrom: today,
          dateTo: today,
          search: "",
          lotNo: "",
          isTest: null,
          itemStatus: "confirmed",
          productCodes: [],
          recordType: "all",
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

export default async function ProductionLineWeightScaleReportPage({ searchParams }) {
  const { departmentId, departmentName, productOptions, initialReportPayload } =
    await loadInitialWeightScaleReportData(searchParams);

  return (
    <WeightScaleReportPageClient
      departmentId={departmentId}
      departmentName={departmentName}
      productOptions={productOptions}
      initialReportPayload={initialReportPayload}
    />
  );
}
