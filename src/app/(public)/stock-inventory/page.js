import { redirect } from "next/navigation";

export default function StockInventoryRedirectPage() {
    redirect("/stock-inventory/summary");
}
