import WeightScaleReturnPageClient from "@/features/production-line/components/WeightScaleReturnPageClient";
import { buildScaleConfigFromEnv } from "@/lib/scale/config";

export const metadata = {
  title: "ชั่งคืนผลิตภัณฑ์ | KPF Production Line",
  description: "ระบบชั่งคืนผลิตภัณฑ์เข้าสต็อก",
};

export default async function WeightScaleReturnPage() {
  const initialScaleConfig = buildScaleConfigFromEnv();

  return (
    <WeightScaleReturnPageClient
      initialScaleConfig={initialScaleConfig}
    />
  );
}
