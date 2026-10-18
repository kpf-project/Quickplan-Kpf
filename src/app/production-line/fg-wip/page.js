import FgWipEndOfDayPageClient from "./FgWipEndOfDayPageClient";

export default async function FgWipEndOfDayPage({ searchParams }) {
  const params = await searchParams;
  const reportTab = ["daily", "wip-balance", "packing"].includes(params?.reportTab) ? params.reportTab : null;
  return <FgWipEndOfDayPageClient initialReportTab={reportTab} />;
}
