import PieceRateStockMovementReportPageClient from "@/features/attendance/components/PieceRateStockMovementReportPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "รายงานสต็อกป้ายแยม",
  description: "ตรวจสอบการชั่งเข้า เบิก ชั่งคืน ยกเลิก และยอดคงเหลือ แยกตามสินค้าและ LOT",
};

export default function PieceRateStockMovementReportPage() {
  console.log("[PieceRateStockMovementReportPage] Server component rendering start!");
  return <PieceRateStockMovementReportPageClient />;
}
