import PlanningControlCenterClient from "@/features/production-planning/components/PlanningControlCenterClient";

export const metadata = {
  title: "รายงาน & ปรับแผนการผลิต",
  description: "ศูนย์ควบคุมและรายงานผลผลิตแบบบูรณาการ ดูและปรับปรุงแผนการผลิตประจำสัปดาห์รายแผนกอย่างมีประสิทธิภาพ",
};

export default async function ProductionPlanningReportPage() {
  return <PlanningControlCenterClient />;
}
