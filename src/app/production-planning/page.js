import { redirect } from "next/navigation";

export default function ProductionPlanningAliasPage() {
  // Compatibility alias for older links/tests that navigate to /production-planning.
  redirect("/production-line/planning/schedule");
}
