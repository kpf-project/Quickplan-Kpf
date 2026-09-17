import { redirect } from "next/navigation";
import DynamicProductionLineSettings from "@/components/DynamicProductionLineSettings";

const ALLOWED_TABS = new Set(["type", "department-products", "work-centers", "routing", "machine", "pallet-barcodes", "piece-rates", "wip-policies", "material-owners", "shifts"]);

export default async function ProductionLineSettingsTabPage({ params }) {
  const resolvedParams = await params;
  const tab = resolvedParams?.tab ?? "type";
  if (!ALLOWED_TABS.has(tab)) {
    redirect("/production-line/settings/type");
  }
  return <DynamicProductionLineSettings initialTab={tab} />;
}
