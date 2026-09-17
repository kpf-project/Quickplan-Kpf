import { redirect } from "next/navigation";

export default async function ScheduleReportPage({ searchParams }) {
  const sp = await searchParams;
  const searchString = sp ? new URLSearchParams(sp).toString() : "";
  const destination = `/production-line/planning/report${searchString ? `?${searchString}` : ""}`;
  redirect(destination);
}
