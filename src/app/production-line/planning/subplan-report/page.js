import DynamicProductionPlanning from "@/components/DynamicProductionPlanning";

export default async function SubplanReportPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  return (
    <DynamicProductionPlanning
      initialView="report"
      initialSearchParams={{
        ...(resolvedSearchParams || {}),
        reportPlanKind: "sub",
      }}
    />
  );
}