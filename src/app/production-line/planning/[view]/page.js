import { redirect } from "next/navigation";
import DynamicProductionPlanning from "@/components/DynamicProductionPlanning";

const ALLOWED_VIEWS = new Set(["plan", "report", "expired"]);

export default async function ProductionPlanningViewPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const view = resolvedParams?.view ?? "plan";

  if (view === "inbox") {
    redirect("/production-line/planning/plan");
  }

  if (view === "master") {
    redirect("/production-line/planning/schedule");
  }

  if (!ALLOWED_VIEWS.has(view)) {
    redirect("/production-line/planning/schedule");
  }

  return (
    <DynamicProductionPlanning
      initialView={view}
      initialSearchParams={resolvedSearchParams || {}}
    />
  );
}
