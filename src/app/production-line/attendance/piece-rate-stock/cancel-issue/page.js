import { redirect } from "next/navigation";

export const metadata = {
  title: "ยกเลิกเบิกป้ายแยม | KPF Production Line",
};

export default function PieceRateStockCancelIssuePage() {
  redirect("/production-line/attendance/piece-rate-scan?tab=cancel-issue");
}
