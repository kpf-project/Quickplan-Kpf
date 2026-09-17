import RawMaterialRequisitionsPageClient from "@/features/raw-material-requisitions/components/RawMaterialRequisitionsPageClient";

export default async function RawMaterialRequisitionsTabPage({ params }) {
  const resolvedParams = await params;
  const tab = resolvedParams?.tab ?? "requisition";
  return <RawMaterialRequisitionsPageClient key={tab} initialTab={tab} />;
}
