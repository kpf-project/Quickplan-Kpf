import { RequisitionPreviewGeneratorClient } from "@/features/production-planning/components/RequisitionPreviewGeneratorClient";

function normalizeDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export const metadata = {
  title: "Preview Demand ใบเบิก",
};

export default async function RequisitionPreviewPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const initialMasterPlanNo = String(
    resolvedSearchParams?.masterPlanNo || resolvedSearchParams?.planNo || ""
  ).trim().toUpperCase();
  const initialDateFrom = normalizeDate(resolvedSearchParams?.dateFrom);
  const initialDateTo = normalizeDate(resolvedSearchParams?.dateTo);

  return (
    <RequisitionPreviewGeneratorClient
      initialMasterPlanNo={initialMasterPlanNo}
      initialDateFrom={initialDateFrom}
      initialDateTo={initialDateTo}
    />
  );
}
