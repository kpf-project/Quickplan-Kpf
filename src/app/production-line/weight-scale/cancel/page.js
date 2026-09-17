import WeightScaleCancelPageClient from "@/features/production-line/components/WeightScaleCancelPageClient";
import { loadScaleProductsData } from "@/lib/scale/products";
import { loadScaleCancelableReceiptsData } from "@/lib/scale/receipts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ยกเลิกชั่งน้ำหนักผลิตภัณฑ์",
  description:
    "ยกเลิกรายการชั่งที่ยังไม่ถูกเบิกผ่านการสแกนบาร์โค้ด กล้องมือถือ หรือการค้นหารายการย้อนหลัง",
};

function getBangkokDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ProductionLineWeightScaleCancelPage() {
  const productsPayload = await loadScaleProductsData();
  const departmentId = productsPayload?.preset?.departmentId || null;
  const todayReceiptDate = getBangkokDateInputValue();
  const initialPayload = await loadScaleCancelableReceiptsData(undefined, {
    departmentId,
    dateFrom: todayReceiptDate,
    dateTo: todayReceiptDate,
    page: 1,
    limit: 50,
  });

  return (
    <WeightScaleCancelPageClient
      scope={{
        departmentId,
        departmentCode: productsPayload?.preset?.departmentCode || "KP13",
        departmentName: productsPayload?.preset?.departmentName || "แผนกบิสกิต",
        categoryCode: productsPayload?.preset?.categoryCode || "03",
        products: productsPayload?.products || [],
      }}
      todayReceiptDate={todayReceiptDate}
      initialRows={initialPayload?.receipts || []}
      initialSummary={initialPayload?.summary || {}}
      initialFilters={initialPayload?.filters || {}}
      initialPagination={initialPayload?.pagination || {}}
    />
  );
}
