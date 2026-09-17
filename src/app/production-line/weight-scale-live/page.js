import { headers } from "next/headers";
import WeightScaleLivePageClient from "@/features/production-line/components/WeightScaleLivePageClient";
import {
  requireWeightScaleLivePermission,
} from "@/lib/scale/live-access";
import {
  loadWeightScaleLiveProductsData,
  loadWeightScaleLiveRecentReceiptsData,
} from "@/lib/scale/live-products";
import { loadScaleLotsData } from "@/lib/scale/lots";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ชั่งน้ำหนักเพื่อรับเข้า",
  description: "หน้าชั่งน้ำหนักเพื่อรับเข้าผ่าน serial scale agent สำหรับสายการผลิต",
};

async function loadInitialWeightScaleLiveData() {
  try {
    const requestHeaders = await headers();
    const request = new Request(
      "http://localhost/production-line/weight-scale-live",
      { headers: requestHeaders }
    );
    const permission = await requireWeightScaleLivePermission(request);
    const initialProductsPayload = await loadWeightScaleLiveProductsData(undefined, {
      userId: permission.userId,
      isAdmin: permission.isAdmin,
    });

    if (!initialProductsPayload.products.length) {
      return {
        initialProductsPayload,
        initialLotsPayload: { lots: [] },
        initialReceiptsPayload: null,
      };
    }

    const [initialLotsPayload, initialReceiptsPayload] = await Promise.all([
      loadScaleLotsData({
        products: initialProductsPayload.products,
      }),
      loadWeightScaleLiveRecentReceiptsData(undefined, {
        departmentIds: initialProductsPayload.preset?.departmentIds || [],
        limit: 20,
      }),
    ]);

    return {
      initialProductsPayload,
      initialLotsPayload,
      initialReceiptsPayload,
    };
  } catch (error) {
    console.error("[weight-scale-live] Failed to load initial products", error);

    return {
      initialProductsPayload: null,
      initialLotsPayload: null,
      initialReceiptsPayload: null,
    };
  }
}

export default async function ProductionLineWeightScaleLivePage() {
  const {
    initialProductsPayload,
    initialLotsPayload,
    initialReceiptsPayload,
  } =
    await loadInitialWeightScaleLiveData();

  return (
    <WeightScaleLivePageClient
      initialProductsPayload={initialProductsPayload}
      initialLotsPayload={initialLotsPayload}
      initialReceiptsPayload={initialReceiptsPayload}
    />
  );
}
