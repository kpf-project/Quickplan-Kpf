import MaterialCostEstimateClient from "@/features/production-costing/components/MaterialCostEstimateClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ประมาณการต้นทุนวัตถุดิบ | Quickplan KPF",
  description: "ประมาณการต้นทุนวัตถุดิบจาก BOM และราคาล่าสุดไม่รวม VAT",
};

export default function MaterialCostEstimatePage() {
  return <MaterialCostEstimateClient />;
}
