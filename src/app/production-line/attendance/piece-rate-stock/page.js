import { redirect } from "next/navigation";

export default function PieceRateStockPage() {
  redirect("/production-line/attendance/piece-rate-scan?tab=issue");
}
