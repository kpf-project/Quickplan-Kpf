import ProductionScheduleClient from "@/features/production-planning/components/ProductionScheduleClient";

export const metadata = { title: "ตารางผลิต" };

export default async function ProductionSchedulePage({ searchParams }) {
  const sp = await searchParams;
  const deptId      = sp?.deptId      ?? null;
  const masterPlanNo = sp?.masterPlanNo ?? null;
  // templateId can be passed via ?templateId=xxx to pin a specific template
  const templateId  = sp?.templateId  ?? null;

  return (
    <ProductionScheduleClient
      deptId={deptId}
      templateId={templateId}
      masterPlanNo={masterPlanNo}
    />
  );
}
