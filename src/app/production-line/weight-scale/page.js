import WeightScalePageClient from "@/features/production-line/components/WeightScalePageClient";
import { buildScaleConfigFromEnv } from "@/lib/scale/config";
import { loadScaleLotsData } from "@/lib/scale/lots";
import { loadScaleProductsData } from "@/lib/scale/products";
import { loadScaleRecentReceiptsData } from "@/lib/scale/receipts";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ชั่งน้ำหนักผลิตภัณฑ์",
  description: "หน้าชั่งน้ำหนักผ่าน Modbus TCP สำหรับสายการผลิต",
};

async function loadInitialWeightScaleData() {
  const initialScaleConfig = buildScaleConfigFromEnv();

  try {
    const initialProductsPayload = await loadScaleProductsData();

    return {
      initialScaleConfig,
      initialProductsPayload,
      initialLotsPayload: await loadScaleLotsData({
        products: initialProductsPayload.products,
      }),
      initialReceiptsPayload: await loadScaleRecentReceiptsData(undefined, {
        departmentId: initialProductsPayload.preset?.departmentId || null,
        limit: 20,
      }),
    };
  } catch (error) {
    console.error("[weight-scale] Failed to load initial products", error);

    return {
      initialScaleConfig,
      initialProductsPayload: null,
      initialLotsPayload: null,
      initialReceiptsPayload: null,
    };
  }
}

export default async function ProductionLineWeightScalePage() {
  const {
    initialScaleConfig,
    initialProductsPayload,
    initialLotsPayload,
    initialReceiptsPayload,
  } =
    await loadInitialWeightScaleData();

  return (
    <WeightScalePageClient
      initialScaleConfig={initialScaleConfig}
      initialProductsPayload={initialProductsPayload}
      initialLotsPayload={initialLotsPayload}
      initialReceiptsPayload={initialReceiptsPayload}
    />
  );
}
