import { redirect } from "next/navigation";

export const metadata = {
  title: "ชั่งคืนเนื้อขนมป้ายแยม | KPF Production Line",
};

export default function PieceRateStockReturnPage() {
  redirect("/production-line/attendance/piece-rate-scan?tab=return");
}
