import ProductionCostWorkbenchClient from "@/features/production-costing/components/ProductionCostWorkbenchClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ต้นทุนการผลิต | Quickplan KPF",
  description: "ระบบคิดต้นทุนการผลิตแบบแยกช่วงและเจาะลึก (Process Costing Workbench)",
};

export default async function ProductionCostingPage({ searchParams }) {
  const mode = (await searchParams)?.mode;

  if (mode === "lot") {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-2">
        <ProductionCostWorkbenchClient
          initialExecutiveReport
          returnHref="/production-line/costing"
        />
      </div>
    );
  }

  if (mode === "workbench") {
    return (
      <div className="min-h-screen bg-[#f4f7fb] p-2">
        <ProductionCostWorkbenchClient />
      </div>
    );
  }

  redirect("/production-line/costing/estimate");
}
