import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "เปลี่ยนเส้นทางนำเข้าสต็อกตั้งต้น",
  description: "เปลี่ยนเส้นทางไปยังหน้าหลักของการนำเข้าสต็อกตั้งต้นไลน์ผลิต",
};

export default function ProductionStockOpeningBalanceRedirectPage() {
  redirect("/production-line/stock");
}
