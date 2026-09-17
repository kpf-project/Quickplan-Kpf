import { redirect } from "next/navigation";

export const metadata = {
  title: "เบิกเนื้อขนมป้ายแยม | KPF Production Line",
};

export default function PieceRateStockIssuePage() {
  redirect("/production-line/attendance/piece-rate-scan?tab=issue");
}
