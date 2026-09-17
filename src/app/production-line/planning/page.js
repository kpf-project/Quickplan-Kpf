import { redirect } from "next/navigation";

export default function ProductionPlanningRedirectPage() {
  redirect("/production-line/planning/schedule");
}
