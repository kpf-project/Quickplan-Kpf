import DynamicRawMaterials from "@/components/DynamicRawMaterials";

export default async function RawMaterialsViewPage({ params }) {
  const resolvedParams = await params;
  const view = resolvedParams?.view ?? "summary";
  return <DynamicRawMaterials key={view} initialView={view} />;
}
