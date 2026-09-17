"use client";
import dynamic from "next/dynamic";

const StockInventoryPageClient = dynamic(
    () => import("@/features/raw-materials/components/RawMaterialsPageClient"),
    { ssr: false }
);

export default function DynamicStockInventory({ initialView }) {
    return <StockInventoryPageClient initialView={initialView} skipDeduction={true} />;
}
