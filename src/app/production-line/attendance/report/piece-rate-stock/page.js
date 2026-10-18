import PieceRateStockMovementReportPageClient from "@/features/attendance/components/PieceRateStockMovementReportPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสต็อกป้ายแยม",
  description: "ตรวจสอบการชั่งเข้า เบิก ชั่งคืน ยกเลิก และยอดคงเหลือ แยกตามสินค้าและ LOT",
};

export default async function PieceRateStockMovementReportPage({ searchParams }) {
  const params = await searchParams;
  const requestedReport = params?.reportType || params?.report;
  const reportType = ["inbound", "inbound-fg", "issue", "movement", "balance", "prison"].includes(requestedReport) ? requestedReport : "inbound";
  const prisonView = ["receipt", "issue", "balance"].includes(params?.prisonView) ? params.prisonView : "receipt";
  const isoDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : undefined;
  return <PieceRateStockMovementReportPageClient initialReportType={reportType} initialPrisonView={prisonView} initialDateFrom={isoDate(params?.dateFrom)} initialDateTo={isoDate(params?.dateTo)} />;
}
