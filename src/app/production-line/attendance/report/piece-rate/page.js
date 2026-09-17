import PieceRateReportPageClient from "@/features/attendance/components/PieceRateReportPageClient";

export default async function PieceRateReportPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const initialViewMode = resolvedSearchParams?.viewMode === "detail"
    ? "detail"
    : resolvedSearchParams?.viewMode === "product"
      ? "product"
    : resolvedSearchParams?.viewMode === "employee"
      ? "employee"
      : "grouped";
  return <PieceRateReportPageClient initialViewMode={initialViewMode} />;
}
