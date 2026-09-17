import DynamicStockInventory from "@/components/DynamicStockInventory";
import PermissionGate from "@/components/PermissionGate";

export default async function StockInventoryViewPage({ params }) {
  const resolvedParams = await params;
  const view = resolvedParams?.view ?? "summary";
  return (
    <PermissionGate permissionsAny={["stock-inventory"]}>
      <DynamicStockInventory key={view} initialView={view} />
    </PermissionGate>
  );
}
