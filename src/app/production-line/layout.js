import { Suspense } from "react";
import ProductionLineShell from "@/components/ProductionLineShell";
import ProtectedAppLayout from "@/components/ProtectedAppLayout";

export const dynamic = "force-dynamic";

export default async function ProductionLineLayout({ children }) {
  return (
    <ProtectedAppLayout>
      <Suspense><ProductionLineShell>{children}</ProductionLineShell></Suspense>
    </ProtectedAppLayout>
  );
}
