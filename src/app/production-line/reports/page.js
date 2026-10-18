import ReportCenterClient from "@/features/production-line/components/ReportCenterClient";
import { loadCenterReportData } from "@/features/production-line/report-center/reportData";

export const metadata = { title: "ศูนย์รายงานไลน์ผลิต" };
export const dynamic = "force-dynamic";

export default async function ProductionReportCenterPage({ searchParams }) {
  const initialReport = await loadCenterReportData(await searchParams);
  return <ReportCenterClient initialReport={initialReport} />;
}
