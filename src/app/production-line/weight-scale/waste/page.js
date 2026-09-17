import WeightScaleWastePageClient from "@/features/production-line/components/WeightScaleWastePageClient";
import { buildScaleConfigFromEnv } from "@/lib/scale/config";

export const metadata = {
  title: "ชั่งของเสียผลิตภัณฑ์ | KPF Production Line",
  description: "ระบบชั่งของเสียผลิตภัณฑ์จากรายการเบิก",
};

export default async function WeightScaleWastePage() {
  const initialScaleConfig = buildScaleConfigFromEnv();

  return (
    <WeightScaleWastePageClient
      initialScaleConfig={initialScaleConfig}
    />
  );
}
