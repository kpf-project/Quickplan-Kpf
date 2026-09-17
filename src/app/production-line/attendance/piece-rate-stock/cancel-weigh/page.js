import { redirect } from "next/navigation";

export const metadata = {
  title: "ยกเลิกชั่งเข้าป้ายแยม | KPF Production Line",
};

export default function PieceRateStockCancelWeighPage() {
  redirect("/production-line/attendance/piece-rate-scan?tab=cancel-weigh");
}
