import ProductionInputOutputReportPageClient from "@/features/production-line/components/ProductionInputOutputReportPageClient";
import { loadProductionInputOutputReportData } from "@/lib/production-input-output-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสรุปวัตถุดิบและผลผลิตประจำวัน",
  description: "รายงานเปลือกใช้จริง แยม ของเสีย และ FG ที่ได้ สำหรับประกอบการคำนวณต้นทุน",
};

export default async function ProductionInputOutputReportPage({ searchParams }) {
  const params = await searchParams;
  const reportData = await loadProductionInputOutputReportData(undefined, {
    dateFrom: params?.dateFrom || null,
    dateTo: params?.dateTo || null,
  });

  return <ProductionInputOutputReportPageClient initialData={reportData} reportCenter={params?.reportCenter === "1"} />;
}
